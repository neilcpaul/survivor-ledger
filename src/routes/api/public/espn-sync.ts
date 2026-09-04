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
  updated_at: string;
};

async function syncSchedule(db: SupabaseClient, year: number, weeks: number[]) {
  const all: GameRow[] = [];
  await pool(weeks, 6, async (week) => {
    const data = await getJson(`${SITE}/scoreboard?week=${week}&seasontype=2&dates=${year}`);
    for (const ev of data?.events ?? []) {
      const comp = ev?.competitions?.[0];
      if (!comp) continue;
      const competitors = comp.competitors ?? [];
      const home = competitors.find((c: Json) => c.homeAway === "home");
      const away = competitors.find((c: Json) => c.homeAway === "away");
      const w = ev?.weather ?? {};
      const temp = w.temperature ?? w.highTemperature;
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
        updated_at: new Date().toISOString(),
      });
    }
  });
  return all;
}

async function syncPredictor(games: GameRow[]) {
  await pool(games, 10, async (g) => {
    const data = await getJson(`${CORE}/events/${g.id}/competitions/${g.id}/predictor`, 1);
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
    if (scope !== "schedule-only") await syncPredictor(games);
    for (let i = 0; i < games.length; i += 200) {
      await db.from("games").upsert(games.slice(i, i + 200), { onConflict: "id" });
    }
    summary.games = games.length;

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
