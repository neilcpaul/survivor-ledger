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
import {
  buildSlots,
  greedyPlan,
  optimalPlan,
  survivalCurve,
  WEEKS,
  type Game,
  type Plan,
  type Team,
} from "./survivor";

type Entry = { id: string; name: string; created_at: string };

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
  setPick: (week: number, teamId: string | undefined) => void;
  resetPlan: () => void;
  editedWeeks: Set<number>;
  optimal: Plan;
  currentWeek: number;
  session: Session | null;
  displayName: string | null;
  entries: Entry[];
  entryId: string | null;
  selectEntry: (id: string) => void;
  createEntry: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveState: "guest" | "saving" | "synced" | "error";
  entryName: string | null;
};

const SurvivorContext = createContext<Ctx | null>(null);

export function SurvivorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>({});
  const [originalPlan, setOriginalPlan] = useState<Plan>({});
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

  useEffect(() => {
    if (!session?.user) {
      setDisplayName(null);
      return;
    }
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? session.user.email?.split("@")[0] ?? "Signed in");
      });
  }, [session?.user?.id]);

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
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const optimal = useMemo(() => optimalPlan(slots, teamIds), [slots, teamIds]);

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
        .select("id, name, created_at")
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
  useEffect(() => {
    if (seeded.current || slots.size === 0) return;
    seeded.current = true;
    const seed = greedyPlan(slots);
    setPlan(seed);
    setOriginalPlan(seed);
  }, [slots]);

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
        const base = greedyPlan(slots);
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
  }, [entryId, slots]);

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
  const lastSyncAt = syncQ.data?.last_success_at ?? null;
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

  const createEntry = useCallback(
    async (name: string) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from("entries")
        .insert({ user_id: session.user.id, name })
        .select("id, name, created_at")
        .single();
      if (data) {
        qc.invalidateQueries({ queryKey: ["entries", session.user.id] });
        setEntryId(data.id);
      }
    },
    [session?.user?.id, qc],
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
    session,
    displayName,
    entries,
    entryId,
    selectEntry: setEntryId,
    createEntry,
    signOut,
    saveState: session?.user ? saveState : "guest",
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
