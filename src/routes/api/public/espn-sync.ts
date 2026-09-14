import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const SITEWEB = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

/* ESPN payloads are undocumented and change shape; treat them as loose JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function getJson(url: string, tries = 2): Promise<Json | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      return (await res.json()) as Json;
    } catch {
      /* retry */
    }
  }
  return null;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

function currentSeasonYear(): number {
  const now = new Date();
  // NFL season year rolls over in March
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function syncTeams(db: SupabaseClient) {
  const data = await getJson(`${SITE}/teams?limit=40`);
  const groups = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const rows = groups
    .map((entry: Json) => entry?.team)
    .filter(Boolean)
    .map((t: Json) => ({
      id: String(t.id),
      abbr: t.abbreviation ?? null,
      name: t.displayName ?? t.name ?? null,
      conference: null as string | null,
      division: null as string | null,
      logo_url: t.logos?.[0]?.href ?? null,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) await db.from("teams").upsert(rows, { onConflict: "id" });
  return rows.length;
}

async function syncGroups(db: SupabaseClient) {
  // conference / division metadata
  const data = await getJson(`${SITE}/groups?season=${currentSeasonYear()}`);
  const conferences = data?.groups ?? [];
  const updates: { id: string; conference: string; division: string }[] = [];
  for (const conf of conferences) {
    for (const div of conf?.children ?? []) {
      for (const t of div?.teams ?? []) {
        updates.push({
          id: String(t.id),
          conference: conf.abbreviation ?? conf.name ?? "",
          division: div.shortName ?? div.name ?? "",
        });
      }
    }
  }
  for (const u of updates) {
    await db.from("teams").update({ conference: u.conference, division: u.division }).eq("id", u.id);
  }
  return updates.length;
}

type GameRow = {
  id: string;
  week: number;
  season_type: number;
  season_year: number;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_indoor: boolean | null;
  broadcast: string | null;
  weather_condition: string | null;
  weather_temp_f: number | null;
  home_win_prob: number | null;
  away_win_prob: number | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  status_state: string | null;
  status_completed: boolean;
  status_detail: string | null;
  period: number | null;
  display_clock: string | null;
  home_linescores: Json;
  away_linescores: Json;
  live_home_win_prob: number | null;
  live_away_win_prob: number | null;
  situation: Json;
  updated_at: string;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function linescores(side: Json): Json {
  const rows = (side?.linescores ?? [])
    .map((l: Json, i: number) => ({
      period: Number(l?.period ?? i + 1),
      display: String(l?.displayValue ?? l?.value ?? ""),
    }))
    .filter((l: Json) => l.display !== "");
  return rows.length ? rows : null;
}

async function syncSchedule(db: SupabaseClient, year: number, weeks: number[]) {
  const all: GameRow[] = [];
  await pool(weeks, 6, async (week) => {
    const data = await getJson(`${SITE}/scoreboard?week=${week}&seasontype=2&dates=${year}`);
    for (const ev of data?.events ?? []) {
      const comp = ev?.competitions?.[0];
      if (!comp) continue;
      const competitors = comp.competitors ?? [];
      // competitors[] order is not home/away — always read homeAway.
      const home = competitors.find((c: Json) => c.homeAway === "home");
      const away = competitors.find((c: Json) => c.homeAway === "away");
      const w = ev?.weather ?? {};
      const temp = w.temperature ?? w.highTemperature;
      const status = comp?.status ?? ev?.status ?? {};
      const type = status?.type ?? {};
      const completed = type?.completed === true;
      // `winner` is absent (not false) before a game is played.
      const homeWinner = typeof home?.winner === "boolean" ? home.winner : null;
      const awayWinner = typeof away?.winner === "boolean" ? away.winner : null;
      const winnerTeamId = !completed
        ? null
        : homeWinner === true
          ? String(home?.team?.id ?? "")
          : awayWinner === true
            ? String(away?.team?.id ?? "")
            : null; // both false on a completed game = tie
      const situation = comp?.situation ?? null;
      const liveProb = situation?.lastPlay?.probability ?? null;
      all.push({
        id: String(ev.id),
        week: Number(ev?.week?.number ?? week),
        season_type: 2,
        season_year: year,
        home_team_id: home?.team?.id ? String(home.team.id) : null,
        away_team_id: away?.team?.id ? String(away.team.id) : null,
        kickoff_at: ev?.date ?? null,
        venue_name: comp?.venue?.fullName ?? null,
        venue_city: comp?.venue?.address?.city ?? null,
        venue_state: comp?.venue?.address?.state ?? null,
        venue_indoor: typeof comp?.venue?.indoor === "boolean" ? comp.venue.indoor : null,
        broadcast:
          (comp?.broadcasts ?? [])
            .flatMap((b: Json) => b?.names ?? [])
            .filter(Boolean)
            .join(", ") || null,
        weather_condition: w.displayValue ?? null,
        weather_temp_f: typeof temp === "number" ? Math.round(temp) : null,
        home_win_prob: null,
        away_win_prob: null,
        home_score: num(home?.score),
        away_score: num(away?.score),
        winner_team_id: winnerTeamId || null,
        status_state: type?.state ?? null,
        status_completed: completed,
        status_detail: type?.detail ?? type?.shortDetail ?? null,
        period: num(status?.period),
        display_clock: status?.displayClock ?? null,
        home_linescores: linescores(home),
        away_linescores: linescores(away),
        live_home_win_prob:
          liveProb?.homeWinPercentage != null ? Number(liveProb.homeWinPercentage) : null,
        live_away_win_prob:
          liveProb?.awayWinPercentage != null ? Number(liveProb.awayWinPercentage) : null,
        situation: situation
          ? {
              downDistanceText: situation.downDistanceText ?? null,
              isRedZone: situation.isRedZone ?? null,
              possession: situation.possession != null ? String(situation.possession) : null,
              lastPlay: situation.lastPlay?.text ?? null,
            }
          : null,
        updated_at: new Date().toISOString(),
      });
    }
  });
  return all;
}

/**
 * The season clock, derived from data rather than the calendar: ESPN's own
 * "current week" is validated against results, and the current week is the
 * earliest week that is not yet fully complete.
 */
async function syncSeasonState(db: SupabaseClient, year: number, games: GameRow[]) {
  const live = await getJson(`${SITE}/scoreboard`);
  const espnWeek = num(live?.week?.number);
  const seasonType = num(live?.season?.type) ?? 2;

  const byWeek = new Map<number, GameRow[]>();
  for (const g of games) {
    if (!byWeek.has(g.week)) byWeek.set(g.week, []);
    byWeek.get(g.week)!.push(g);
  }
  let derived: number | null = null;
  for (let w = 1; w <= 18; w++) {
    const rows = byWeek.get(w) ?? [];
    if (!rows.length) continue;
    if (!rows.every((g) => g.status_completed)) {
      derived = w;
      break;
    }
  }
  const currentWeek = derived ?? (espnWeek && espnWeek >= 1 && espnWeek <= 18 ? espnWeek : 18);

  await db.from("season_state").upsert({
    id: "nfl",
    current_week: currentWeek,
    season_type: seasonType,
    season_year: year,
    last_synced_at: new Date().toISOString(),
  });
  return currentWeek;
}

function impliedFromMoneyline(ml: number | null | undefined): number | null {
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml === 0) return null;
  return ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
}

/** Fallback when ESPN's BPI predictor has no numbers yet: sportsbook moneylines. */
async function syncOddsFallback(games: GameRow[]) {
  const missing = games.filter((g) => g.home_win_prob == null || g.away_win_prob == null);
  await pool(missing, 8, async (g) => {
    const data = await getJson(`${CORE}/events/${g.id}/competitions/${g.id}/odds`, 1);
    const item = data?.items?.[0];
    if (!item) return;
    const rawHome = impliedFromMoneyline(item?.homeTeamOdds?.moneyLine);
    const rawAway = impliedFromMoneyline(item?.awayTeamOdds?.moneyLine);
    if (rawHome == null || rawAway == null) return;
    const total = rawHome + rawAway; // strip the bookmaker's overround
    if (total <= 0) return;
    g.home_win_prob = rawHome / total;
    g.away_win_prob = rawAway / total;
  });
}

async function syncPredictor(games: GameRow[]) {
  await pool(games, 10, async (g) => {
    const data = await getJson(`${CORE}/events/${g.id}/competitions/${g.id}/predictor`, 2);
    if (!data) return;
    const find = (side: Json | undefined) =>
      (side?.statistics ?? []).find((s: Json) => s?.name === "gameProjection")?.value;
    const h = find(data.homeTeam);
    const a = find(data.awayTeam);
    if (typeof h === "number") g.home_win_prob = Math.min(1, Math.max(0, h / 100));
    if (typeof a === "number") g.away_win_prob = Math.min(1, Math.max(0, a / 100));
    if (g.home_win_prob != null && g.away_win_prob == null) g.away_win_prob = 1 - g.home_win_prob;
    if (g.away_win_prob != null && g.home_win_prob == null) g.home_win_prob = 1 - g.away_win_prob;
  });
}

async function syncNews(db: SupabaseClient) {
  const data = await getJson(`${SITE}/news?limit=50`);
  const now = new Date().toISOString();
  const rows = (data?.articles ?? [])
    .map((a: Json) => {
      const id =
        a?.id != null
          ? String(a.id)
          : (a?.links?.web?.href ? String(a.links.web.href) : null);
      if (!id) return null;
      const teamIds = (a?.categories ?? [])
        .filter((c: Json) => c?.type === "team" && c?.teamId != null)
        .map((c: Json) => Number(c.teamId))
        .filter((n: number) => Number.isFinite(n));
      return {
        id,
        headline: a?.headline ?? a?.title ?? null,
        description: a?.description ?? null,
        published_at: a?.published ?? a?.lastModified ?? null,
        byline: a?.byline ?? null,
        image_url: a?.images?.[0]?.url ?? null,
        image_caption: a?.images?.[0]?.caption ?? a?.images?.[0]?.alt ?? null,
        article_url: a?.links?.web?.href ?? null,
        team_ids: Array.from(new Set<number>(teamIds)),
        updated_at: now,
      };
    })
    .filter(Boolean);
  if (rows.length) await db.from("news_articles").upsert(rows, { onConflict: "id" });
  return rows.length;
}

async function syncInjuries(db: SupabaseClient) {
  const data = await getJson(`${SITEWEB}/injuries`);
  const rows: Json[] = [];
  const now = new Date().toISOString();
  for (const team of data?.injuries ?? []) {
    const teamId = team?.id ? String(team.id) : null;
    if (!teamId) continue;
    for (const inj of team?.injuries ?? []) {
      const ath = inj?.athlete ?? {};
      const href: string = (ath?.links ?? []).map((l: Json) => l?.href).find(Boolean) ?? "";
      const fromHref = /\/id\/(\d+)/.exec(href)?.[1];
      const athleteId = ath?.id ? String(ath.id) : (fromHref ?? (inj?.id ? `inj-${inj.id}` : null));
      if (!athleteId) continue;
      rows.push({
        team_id: teamId,
        athlete_id: athleteId,
        player_name: ath?.displayName ?? null,
        position: ath?.position?.abbreviation ?? ath?.position?.name ?? null,
        status: inj?.status ?? null,
        detail: inj?.shortComment ?? inj?.details?.type ?? null,
        updated_at: now,
      });
    }
  }
  if (rows.length) {
    await db.from("injuries").delete().neq("team_id", "__none__");
    for (let i = 0; i < rows.length; i += 500) {
      await db.from("injuries").upsert(rows.slice(i, i + 500), { onConflict: "team_id,athlete_id" });
    }
  }
  return rows.length;
}

async function syncRosters(db: SupabaseClient, teamIds: string[]) {
  const rows: Json[] = [];
  const now = new Date().toISOString();
  await pool(teamIds, 8, async (teamId) => {
    const data = await getJson(`${SITE}/teams/${teamId}/roster`, 1);
    for (const group of data?.athletes ?? []) {
      for (const a of group?.items ?? []) {
        if (!a?.id) continue;
        rows.push({
          team_id: teamId,
          athlete_id: String(a.id),
          name: a.fullName ?? a.displayName ?? null,
          position: a?.position?.abbreviation ?? null,
          jersey_number: a.jersey ?? null,
          headshot_url: a?.headshot?.href ?? null,
          updated_at: now,
        });
      }
    }
  });
  for (let i = 0; i < rows.length; i += 500) {
    await db.from("roster_players").upsert(rows.slice(i, i + 500), { onConflict: "team_id,athlete_id" });
  }
  return rows.length;
}

async function runSync(scope: string) {
  const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const year = currentSeasonYear();
  const started = new Date().toISOString();
  await db.from("sync_state").upsert({ id: "espn", last_attempt_at: started, running_since: started });

  const summary: Json = { season_year: year, scope };
  try {
    summary.teams = await syncTeams(db);
    await syncGroups(db);

    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    const games = await syncSchedule(db, year, weeks);

    // A played game keeps the pre-game probability it was stored with — a
    // post-hoc predictor call would silently rewrite history.
    const { data: stored } = await db.from("games").select("id, home_win_prob, away_win_prob");
    const prior = new Map<string, { h: number | null; a: number | null }>(
      (stored ?? []).map((r: Json) => [
        String(r.id),
        { h: r.home_win_prob != null ? Number(r.home_win_prob) : null, a: r.away_win_prob != null ? Number(r.away_win_prob) : null },
      ]),
    );
    for (const g of games) {
      const p = prior.get(g.id);
      if (g.status_completed && p?.h != null && p?.a != null) {
        g.home_win_prob = p.h;
        g.away_win_prob = p.a;
      }
    }

    if (scope !== "schedule-only") {
      const needProb = games.filter((g) => g.home_win_prob == null || g.away_win_prob == null);
      await syncPredictor(needProb);
      await syncOddsFallback(needProb);
      summary.games_with_prob = games.filter((g) => g.home_win_prob != null).length;
    }
    for (let i = 0; i < games.length; i += 200) {
      await db.from("games").upsert(games.slice(i, i + 200), { onConflict: "id" });
    }
    summary.games = games.length;
    summary.current_week = await syncSeasonState(db, year, games);

    summary.news = await syncNews(db);


    if (scope === "full") {
      summary.injuries = await syncInjuries(db);
      const { data: teamRows } = await db.from("teams").select("id");
      summary.roster_players = await syncRosters(db, (teamRows ?? []).map((t: Json) => String(t.id)));
    }

    await db
      .from("sync_state")
      .update({ last_success_at: new Date().toISOString(), last_error: null, running_since: null })
      .eq("id", "espn");
    return { ok: true, ...summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("sync_state").update({ last_error: message, running_since: null }).eq("id", "espn");
    return { ok: false, error: message, ...summary };
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let scope = url.searchParams.get("scope") ?? "full";
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as Json;
      if (body?.scope) scope = String(body.scope);
    } catch {
      /* empty body is fine */
    }
  }
  const result = await runSync(scope);
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/espn-sync")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
