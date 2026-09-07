import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOptimalPlan } from "./access.functions";
import {
  buildSlots,
  greedyPlan,
  survivalCurve,
  WEEKS,
  type Game,
  type Plan,
  type Team,
} from "./survivor";

type Entry = {
  id: string;
  name: string;
  created_at: string;
  original_picks?: unknown;
  original_locked_at?: string | null;
};


const REFRESH_WINDOW_MS = 5 * 60 * 1000;

async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, abbr, name, conference, division, logo_url")
    .order("abbr");
  if (error) throw error;
  return (data ?? []) as Team[];
}

async function fetchGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, week, home_team_id, away_team_id, kickoff_at, venue_name, venue_city, venue_state, venue_indoor, broadcast, weather_condition, weather_temp_f, home_win_prob, away_win_prob, updated_at",
    )
    .eq("season_type", 2)
    .order("kickoff_at");
  if (error) throw error;
  return (data ?? []) as Game[];
}

// sync_state is readable by signed-in users only (it holds internal sync errors),
// so guests must not request it — an anon request would 401 on every poll.
async function fetchSyncState() {
  const { data } = await supabase
    .from("sync_state")
    .select("last_success_at")
    .eq("id", "espn")
    .maybeSingle();
  return data ?? null;
}



const GUEST_PLAN_KEY = "survivor-ledger.guest-plan";

function readGuestPlan(): Plan {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GUEST_PLAN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const plan: Plan = {};
    for (const [week, teamId] of Object.entries(parsed)) {
      if (typeof teamId === "string") plan[Number(week)] = teamId;
    }
    return plan;
  } catch {
    return {};
  }
}

function writeGuestPlan(plan: Plan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* storage unavailable */
  }
}

const GUEST_ORIGINAL_KEY = "survivor-ledger.guest-original";

type OriginalBaseline = { picks: Plan; lockedAt: string | null };

function planFromJson(raw: unknown): Plan {
  const plan: Plan = {};
  if (raw && typeof raw === "object") {
    for (const [week, teamId] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof teamId === "string") plan[Number(week)] = teamId;
    }
  }
  return plan;
}

function readGuestOriginal(): OriginalBaseline {
  if (typeof window === "undefined") return { picks: {}, lockedAt: null };
  try {
    const raw = window.localStorage.getItem(GUEST_ORIGINAL_KEY);
    if (!raw) return { picks: {}, lockedAt: null };
    const parsed = JSON.parse(raw) as { originalPicks?: unknown; originalLockedAt?: unknown };
    return {
      picks: planFromJson(parsed.originalPicks),
      lockedAt: typeof parsed.originalLockedAt === "string" ? parsed.originalLockedAt : null,
    };
  } catch {
    return { picks: {}, lockedAt: null };
  }
}

function writeGuestOriginal(picks: Plan, lockedAt: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GUEST_ORIGINAL_KEY,
      JSON.stringify({ originalPicks: picks, originalLockedAt: lockedAt }),
    );
  } catch {
    /* storage unavailable */
  }
}

function isComplete(plan: Plan): boolean {
  return WEEKS.every((w) => !!plan[w]);
}


type Ctx = {
  teams: Team[];
  teamsById: Map<string, Team>;
  games: Game[];
  slots: ReturnType<typeof buildSlots>;
  loading: boolean;
  dataError: boolean;
  lastSyncAt: string | null;
  syncFailed: boolean;
  refresh: () => void;
  refreshing: boolean;
  canRefresh: boolean;
  plan: Plan;
  originalPlan: Plan;
  /** True once a baseline has been locked for this entry / local plan. */
  originalLocked: boolean;
  /** Overwrite the baseline with the current picks (manual reset). */
  resetOriginal: () => void;
  /** Every other entry's current plan, for the multi-entry chart overlay. */
  otherEntryPlans: { id: string; name: string; plan: Plan }[];
  setPick: (week: number, teamId: string | undefined) => void;
  resetPlan: () => void;

  editedWeeks: Set<number>;
  optimal: Plan;
  currentWeek: number;
  tier: "basic" | "analysis";
  isAnalysis: boolean;
  isAdmin: boolean;
  session: Session | null;
  displayName: string | null;
  entries: Entry[];
  entryId: string | null;
  selectEntry: (id: string) => void;
  createEntry: (name: string) => Promise<void>;
  renameEntry: (id: string, name: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveState: "guest" | "saving" | "synced" | "error" | "no-entry";
  entryName: string | null;
};

// Cached on globalThis so a hot-module reload of this file reuses the same
// context object; otherwise __root's provider keeps the old context while
// re-rendered pages read a brand new one and throw "must be used inside".
const globalStore = globalThis as typeof globalThis & {
  __survivorContext?: React.Context<Ctx | null>;
};
const SurvivorContext = (globalStore.__survivorContext ??= createContext<Ctx | null>(null));

export function SurvivorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>({});
  const [originalPlan, setOriginalPlan] = useState<Plan>({});
  const [originalLockedAt, setOriginalLockedAt] = useState<string | null>(null);
  // Read inside callbacks so a pick write never re-locks an existing baseline.
  const lockedRef = useRef<string | null>(null);
  lockedRef.current = originalLockedAt;

  const [saveState, setSaveState] = useState<Ctx["saveState"]>("guest");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshClick, setLastRefreshClick] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const seeded = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* ---------------- auth ---------------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      setSession(s ?? null);
      if (event === "SIGNED_OUT") {
        setEntryId(null);
        setSaveState("guest");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const profileQ = useQuery({
    queryKey: ["profile", session?.user?.id ?? "anon"],
    enabled: !!session?.user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, tier, is_admin")
        .eq("id", session!.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  // Signed-out visitors are treated as basic tier.
  const tier: "basic" | "analysis" =
    profileQ.data?.tier === "analysis" && session?.user ? "analysis" : "basic";
  const isAnalysis = tier === "analysis";
  const isAdmin = !!session?.user && profileQ.data?.is_admin === true;

  useEffect(() => {
    if (!session?.user) {
      setDisplayName(null);
      return;
    }
    setDisplayName(
      profileQ.data?.display_name ?? session.user.email?.split("@")[0] ?? "Signed in",
    );
  }, [session?.user?.id, profileQ.data?.display_name]);

  /* ---------------- reference data ---------------- */
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: fetchTeams, staleTime: 5 * 60_000 });
  const gamesQ = useQuery({ queryKey: ["games"], queryFn: fetchGames, staleTime: 60_000 });
  const syncQ = useQuery({
    queryKey: ["sync-state"],
    queryFn: fetchSyncState,
    enabled: !!session?.user,
    refetchInterval: 60_000,
  });


  const teams = useMemo(() => teamsQ.data ?? [], [teamsQ.data]);
  const games = useMemo(() => gamesQ.data ?? [], [gamesQ.data]);
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const slots = useMemo(() => buildSlots(games), [games]);
  // The optimal (Kuhn–Munkres) plan is analysis-tier only and is computed and
  // authorised server-side; a basic-tier session never receives it.
  const optimalQ = useQuery({
    queryKey: ["optimal-plan", session?.user?.id ?? "anon"],
    enabled: isAnalysis,
    staleTime: 5 * 60_000,
    queryFn: async () => (await getOptimalPlan({ data: {} })).plan ?? {},
  });
  const optimal = useMemo<Plan>(
    () => (isAnalysis ? (optimalQ.data ?? {}) : {}),
    [isAnalysis, optimalQ.data],
  );

  const currentWeek = useMemo(() => {
    const nowIso = new Date(now).toISOString();
    const upcoming = games
      .filter((g) => g.kickoff_at && g.kickoff_at >= nowIso)
      .sort((a, b) => (a.kickoff_at! < b.kickoff_at! ? -1 : 1))[0];
    return upcoming?.week ?? (games.length ? 18 : 1);
  }, [games, now]);

  /* ---------------- entries ---------------- */
  const entriesQ = useQuery({
    queryKey: ["entries", session?.user?.id ?? "anon"],
    enabled: !!session?.user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, name, created_at, original_picks, original_locked_at")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data]);

  // No auto-created placeholder entry: the user names their first entry
  // explicitly from the topbar switcher.
  useEffect(() => {
    if (!session?.user) return;
    if (entries.length && (!entryId || !entries.some((e) => e.id === entryId))) {
      setEntryId(entries[0]!.id);
    } else if (!entries.length && entryId) {
      setEntryId(null);
    }
  }, [entries, entryId, session?.user?.id]);


  /* ------------- seed a starting plan from the data ------------- */
  // Analysis tier starts from a computed plan; basic tier (and guests) start
  // from a blank ledger — restored from this browser's own storage for guests.
  const seededTier = useRef<string | null>(null);
  useEffect(() => {
    if (slots.size === 0 || profileQ.isLoading) return;
    const key = `${isAnalysis}:${session?.user?.id ?? "guest"}`;
    if (seededTier.current === key) return;
    seededTier.current = key;
    seeded.current = true;
    const seed = isAnalysis ? greedyPlan(slots) : {};
    setOriginalPlan(seed);
    setPlan(session?.user ? seed : { ...seed, ...readGuestPlan() });
  }, [isAnalysis, slots, profileQ.isLoading, session?.user?.id]);

  // Guest picks live in this browser only, so a reload keeps them.
  useEffect(() => {
    if (session?.user || !seeded.current) return;
    writeGuestPlan(plan);
  }, [plan, session?.user?.id]);

  /* ------------- load a signed-in entry's saved picks ------------- */
  useEffect(() => {
    if (!entryId || slots.size === 0) return;
    let cancelled = false;
    supabase
      .from("picks")
      .select("week, team_id")
      .eq("entry_id", entryId)
      .then(({ data }) => {
        if (cancelled) return;
        const base = isAnalysis ? greedyPlan(slots) : {};
        const saved: Plan = { ...base };
        for (const row of data ?? []) {
          if (row.team_id) saved[row.week] = row.team_id;
        }
        setOriginalPlan(base);
        setPlan(saved);
        setSaveState("synced");
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, slots, isAnalysis]);

  const setPick = useCallback(
    (week: number, teamId: string | undefined) => {
      setPlan((prev) => {
        const next = { ...prev };
        if (!teamId) delete next[week];
        else {
          // one team per season: release it from any other week
          for (const w of WEEKS) if (next[w] === teamId && w !== week) delete next[w];
          next[week] = teamId;
        }
        return next;
      });
      if (entryId) {
        setSaveState("saving");
        supabase
          .from("picks")
          .upsert({ entry_id: entryId, week, team_id: teamId ?? null }, { onConflict: "entry_id,week" })
          .then(({ error }) => setSaveState(error ? "error" : "synced"));
      }
    },
    [entryId],
  );

  const resetPlan = useCallback(() => {
    setPlan(originalPlan);
    if (entryId) {
      setSaveState("saving");
      const rows = WEEKS.map((w) => ({ entry_id: entryId, week: w, team_id: originalPlan[w] ?? null }));
      supabase
        .from("picks")
        .upsert(rows, { onConflict: "entry_id,week" })
        .then(({ error }) => setSaveState(error ? "error" : "synced"));
    }
  }, [originalPlan, entryId]);

  const editedWeeks = useMemo(() => {
    const s = new Set<number>();
    for (const w of WEEKS) if (plan[w] !== originalPlan[w]) s.add(w);
    return s;
  }, [plan, originalPlan]);

  /* ---------------- refresh ---------------- */
  // Guests can't read sync_state (auth-only), so fall back to the freshest
  // odds timestamp on the publicly readable games rows.
  const gamesUpdatedAt = useMemo(() => {
    let latest: string | null = null;
    for (const g of games) if (g.updated_at && (!latest || g.updated_at > latest)) latest = g.updated_at;
    return latest;
  }, [games]);
  const lastSyncAt = syncQ.data?.last_success_at ?? gamesUpdatedAt;
  const syncFailed = lastSyncAt ? now - new Date(lastSyncAt).getTime() > 24 * 60 * 60 * 1000 : false;
  const staleEnough = lastSyncAt ? now - new Date(lastSyncAt).getTime() > REFRESH_WINDOW_MS : true;

  const canRefresh = staleEnough && now - lastRefreshClick > REFRESH_WINDOW_MS && !refreshing;

  const refresh = useCallback(async () => {
    if (!canRefresh) return;
    setLastRefreshClick(Date.now());
    setRefreshing(true);
    try {
      await fetch("/api/public/espn-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "odds" }),
      });
    } catch {
      /* fall back to cached data */
    }
    setRefreshing(false);
    qc.invalidateQueries({ queryKey: ["games"] });
    qc.invalidateQueries({ queryKey: ["sync-state"] });
  }, [canRefresh, qc]);

  const entriesKey = useMemo(
    () => ["entries", session?.user?.id ?? "anon"] as const,
    [session?.user?.id],
  );

  const createEntry = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!session?.user || !clean) return;
      const { data } = await supabase
        .from("entries")
        .insert({ user_id: session.user.id, name: clean })
        .select("id, name, created_at")
        .single();
      if (data) {
        qc.setQueryData<Entry[]>(entriesKey, (prev) => [...(prev ?? []), data as Entry]);
        setEntryId(data.id);
        qc.invalidateQueries({ queryKey: entriesKey });
      }
    },
    [session?.user?.id, qc, entriesKey],
  );

  const renameEntry = useCallback(
    async (id: string, name: string) => {
      const clean = name.trim();
      if (!session?.user || !clean) return;
      qc.setQueryData<Entry[]>(entriesKey, (prev) =>
        (prev ?? []).map((e) => (e.id === id ? { ...e, name: clean } : e)),
      );
      const { error } = await supabase.from("entries").update({ name: clean }).eq("id", id);
      if (error) qc.invalidateQueries({ queryKey: entriesKey });
    },
    [session?.user?.id, qc, entriesKey],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (!session?.user) return;
      const remaining = entries.filter((e) => e.id !== id);
      if (!remaining.length) return; // never delete the last entry
      qc.setQueryData<Entry[]>(entriesKey, remaining);
      if (entryId === id) setEntryId(remaining[0]!.id);
      await supabase.from("picks").delete().eq("entry_id", id);
      const { error } = await supabase.from("entries").delete().eq("id", id);
      if (error) qc.invalidateQueries({ queryKey: entriesKey });
    },
    [session?.user?.id, qc, entriesKey, entries, entryId],
  );


  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setEntryId(null);
    setSaveState("guest");
  }, []);

  const value: Ctx = {
    teams,
    teamsById,
    games,
    slots,
    loading: teamsQ.isLoading || gamesQ.isLoading,
    dataError: !!teamsQ.error || !!gamesQ.error,
    lastSyncAt,
    syncFailed,
    refresh,
    refreshing,
    canRefresh,
    plan,
    originalPlan,
    setPick,
    resetPlan,
    editedWeeks,
    optimal,
    currentWeek,
    tier,
    isAnalysis,
    isAdmin,
    session,
    displayName,
    entries,
    entryId,
    selectEntry: setEntryId,
    createEntry,
    renameEntry,
    deleteEntry,
    signOut,
    saveState: !session?.user ? "guest" : entryId ? saveState : "no-entry",
    entryName: entries.find((e) => e.id === entryId)?.name ?? null,
  };

  return <SurvivorContext.Provider value={value}>{children}</SurvivorContext.Provider>;
}

export function useSurvivor() {
  const ctx = useContext(SurvivorContext);
  if (!ctx) throw new Error("useSurvivor must be used inside SurvivorProvider");
  return ctx;
}

export function usePlanCurves() {
  const { slots, plan, originalPlan, optimal } = useSurvivor();
  return useMemo(
    () => ({
      mine: survivalCurve(slots, plan),
      original: survivalCurve(slots, originalPlan),
      optimal: survivalCurve(slots, optimal),
    }),
    [slots, plan, originalPlan, optimal],
  );
}
