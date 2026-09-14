import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Empty, GamePill, ResultPill, TeamChipLabel, WinPill } from "@/components/bits";
import { TeamDetailStack } from "@/components/TeamDetail";
import { GameSummary } from "@/components/GameSummary";
import { useSurvivor } from "@/lib/survivor-store";
import {
  gameState,
  isLiveState,
  pct,
  pickOutcome,
  upsetNote,
  WEEKS,
  type Game,
} from "@/lib/survivor";

export const Route = createFileRoute("/fixtures")({
  head: () => ({
    meta: [
      { title: "Fixtures — Survivor Ledger" },
      {
        name: "description",
        content:
          "Week-by-week NFL fixtures with kickoff times, live scores, venue, broadcast, weather and both sides' win probabilities for Survivor pool planning.",
      },
      { property: "og:title", content: "Fixtures — Survivor Ledger" },
      {
        property: "og:description",
        content: "Live scores, kickoffs, venues, weather and win probabilities for every NFL game.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fixtures,
});

function fmtKick(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Fixtures() {
  const { games, teams, teamsById, plan, loading, currentWeek, setPick } = useSurvivor();
  const [week, setWeek] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [drawerGameId, setDrawerGameId] = useState<string | null>(null);
  const [showPlayed, setShowPlayed] = useState(false);
  const activeWeek = week ?? currentWeek;

  const list = useMemo(
    () =>
      games
        .filter((g) => g.week === activeWeek)
        .filter(
          (g) => !teamFilter || g.home_team_id === teamFilter || g.away_team_id === teamFilter,
        )
        .sort((a, b) => (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? "")),
    [games, activeWeek, teamFilter],
  );

  // Live first, then what's still to come, with finished games tucked away.
  const groups = useMemo(() => {
    const live: Game[] = [];
    const upcoming: Game[] = [];
    const played: Game[] = [];
    for (const g of list) {
      const s = gameState(g);
      if (s === "final") played.push(g);
      else if (isLiveState(s) || s === "awaiting-final") live.push(g);
      else upcoming.push(g);
    }
    return { live, upcoming, played };
  }, [list]);

  const drawerGame = useMemo(
    () => list.find((g) => g.id === drawerGameId) ?? null,
    [list, drawerGameId],
  );

  useEffect(() => {
    if (!drawerGameId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerGameId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerGameId]);

  const filterTeamName = teamFilter ? teamsById.get(teamFilter)?.name : null;

  function Row({ g }: { g: Game }) {
    const home = g.home_team_id ? teamsById.get(g.home_team_id) : undefined;
    const away = g.away_team_id ? teamsById.get(g.away_team_id) : undefined;
    const pickedHome = plan[g.week] === g.home_team_id;
    const pickedAway = plan[g.week] === g.away_team_id;
    const open = drawerGameId === g.id;
    const state = gameState(g);
    const done = state === "final";
    const homeWon = done && g.winner_team_id === g.home_team_id;
    const awayWon = done && g.winner_team_id === g.away_team_id;
    const myTeam = plan[g.week];
    const myOutcome =
      myTeam && (myTeam === g.home_team_id || myTeam === g.away_team_id)
        ? pickOutcome(g, myTeam)
        : null;
    const winnerProb = done
      ? g.winner_team_id === g.home_team_id
        ? g.home_win_prob
        : g.away_win_prob
      : null;
    const note = done
      ? (upsetNote(winnerProb, "win", teamsById.get(g.winner_team_id ?? "")?.abbr ?? "") ??
        upsetNote(
          g.winner_team_id === g.home_team_id ? g.away_win_prob : g.home_win_prob,
          "loss",
          teamsById.get(
            (g.winner_team_id === g.home_team_id ? g.away_team_id : g.home_team_id) ?? "",
          )?.abbr ?? "",
        ))
      : null;

    return (
      <Fragment>
        <tr className="expandable" onClick={() => setDrawerGameId(g.id)} aria-expanded={open}>
          <td style={{ width: 24 }}>
            <span className={`chevron${open ? " open" : ""}`} aria-hidden="true">
              ›
            </span>
          </td>
          <th scope="row" className="sub">
            {done || isLiveState(state) ? (
              <span className="flex flex-wrap items-center gap-2">
                <GamePill state={state} detail={g.status_detail} />
                {state === "live" && g.display_clock ? (
                  <span className="num sub">
                    {g.period ? `Q${g.period} · ` : ""}
                    {g.display_clock}
                  </span>
                ) : null}
              </span>
            ) : (
              fmtKick(g.kickoff_at)
            )}
          </th>
          <td>
            <span className="flex items-center gap-2">
              <TeamChipLabel
                abbr={away?.abbr}
                logo={away?.logo_url}
                name={away?.name}
                teamId={away?.id}
              />
              {g.away_score != null && state !== "pre" ? (
                <span className={`num ${awayWon ? "score-win" : done ? "score-lose" : ""}`}>
                  {g.away_score}
                </span>
              ) : null}
            </span>
          </td>
          <td>
            <span className="flex items-center gap-2">
              <TeamChipLabel
                abbr={home?.abbr}
                logo={home?.logo_url}
                name={home?.name}
                teamId={home?.id}
              />
              {g.home_score != null && state !== "pre" ? (
                <span className={`num ${homeWon ? "score-win" : done ? "score-lose" : ""}`}>
                  {g.home_score}
                </span>
              ) : null}
            </span>
          </td>
          <td>
            <WinPill p={g.away_win_prob} />
          </td>
          <td>
            <WinPill p={g.home_win_prob} />
          </td>
          <td className="sub">
            {state === "live" && g.live_home_win_prob != null ? (
              <span className="flex items-center gap-2">
                <span className="livebar" aria-hidden="true">
                  <span style={{ width: `${(g.live_away_win_prob ?? 0) * 100}%` }} />
                  <span style={{ width: `${(g.live_home_win_prob ?? 0) * 100}%` }} />
                </span>
                <span className="num">
                  live {pct(g.live_away_win_prob)}/{pct(g.live_home_win_prob)}
                </span>
              </span>
            ) : note ? (
              <span className="result-note">{note}</span>
            ) : (
              <>
                {g.venue_name ?? "—"}
                {g.venue_city ? ` · ${g.venue_city}` : ""}
                {g.venue_indoor ? " · indoor" : ""}
              </>
            )}
          </td>
          <td className="sub">{g.broadcast ?? "—"}</td>
          <td className="sub">
            {state === "live" && g.situation?.downDistanceText ? (
              <>
                {g.situation.downDistanceText}
                {g.situation.possession
                  ? ` · ${teamsById.get(g.situation.possession)?.abbr ?? ""}`
                  : ""}
              </>
            ) : (
              <>
                {g.weather_condition ?? (g.venue_indoor ? "Climate controlled" : "—")}
                {g.weather_temp_f != null ? ` · ${Math.round(g.weather_temp_f)}°F` : ""}
              </>
            )}
          </td>
          <td onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {myOutcome ? <ResultPill outcome={myOutcome} /> : null}
              <button
                className={`btn${pickedAway ? " primary" : ""}`}
                onClick={() =>
                  setPick(g.week, pickedAway ? undefined : (g.away_team_id ?? undefined))
                }
                aria-label={`Pick ${away?.abbr} for week ${g.week} (${pct(g.away_win_prob)})`}
              >
                {away?.abbr}
              </button>
              <button
                className={`btn${pickedHome ? " primary" : ""}`}
                onClick={() =>
                  setPick(g.week, pickedHome ? undefined : (g.home_team_id ?? undefined))
                }
                aria-label={`Pick ${home?.abbr} for week ${g.week} (${pct(g.home_win_prob)})`}
              >
                {home?.abbr}
              </button>
            </div>
          </td>
        </tr>
      </Fragment>
    );
  }

  function Section({ title, rows, extra }: { title: string; rows: Game[]; extra?: React.ReactNode }) {
    if (!rows.length) return null;
    return (
      <>
        <div className="fixture-section-head">
          <h3>{title}</h3>
          {extra}
        </div>
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th scope="col" aria-label="Expand" />
                <th scope="col">Kickoff</th>
                <th scope="col">Away</th>
                <th scope="col">Home</th>
                <th scope="col">Away win</th>
                <th scope="col">Home win</th>
                <th scope="col">Venue</th>
                <th scope="col">TV</th>
                <th scope="col">Conditions</th>
                <th scope="col">Pick</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <Row key={g.id} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <AppShell title="Fixtures">
      {loading ? (
        <Empty>Loading fixtures…</Empty>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2>Week {activeWeek}</h2>
                <p className="sub">
                  {list.length} games · times shown in your local timezone · click a row for scores,
                  injuries and rosters
                </p>
              </div>
              <select
                className="control"
                aria-label="Filter by team"
                value={teamFilter}
                onChange={(e) => {
                  setTeamFilter(e.target.value);
                  setDrawerGameId(null);
                }}
              >
                <option value="">All teams</option>
                {[...teams]
                  .sort((a, b) => (a.name ?? a.abbr ?? "").localeCompare(b.name ?? b.abbr ?? ""))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.abbr}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKS.map((w) => (
                <button
                  key={w}
                  className={`btn${w === activeWeek ? " primary" : ""}`}
                  onClick={() => {
                    setWeek(w);
                    setDrawerGameId(null);
                  }}
                  aria-pressed={w === activeWeek}
                >
                  W{w}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            {list.length === 0 ? (
              <Empty>
                {filterTeamName
                  ? `${filterTeamName} have no game in week ${activeWeek} (bye week).`
                  : "No games scheduled for this week."}
              </Empty>
            ) : (
              <>
                <Section title="Live" rows={groups.live} />
                <Section title="Upcoming" rows={groups.upcoming} />
                {groups.played.length ? (
                  showPlayed ? (
                    <Section
                      title="Played"
                      rows={groups.played}
                      extra={
                        <button className="btn" onClick={() => setShowPlayed(false)}>
                          hide
                        </button>
                      }
                    />
                  ) : (
                    <div className="fixture-section-head">
                      <h3>Played</h3>
                      <button className="btn" onClick={() => setShowPlayed(true)}>
                        {groups.played.length} played · show
                      </button>
                    </div>
                  )
                ) : null}
              </>
            )}
          </section>

          {drawerGame ? (
            <div
              className="drawer-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDrawerGameId(null);
              }}
              aria-hidden={!drawerGame}
            >
              <div
                className="fixture-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-title"
              >
                <div className="drawer-head">
                  <div className="min-w-0">
                    <h3 id="drawer-title">
                      {teamsById.get(drawerGame.away_team_id ?? "")?.abbr} @{" "}
                      {teamsById.get(drawerGame.home_team_id ?? "")?.abbr}
                    </h3>
                    <div className="sub">
                      {drawerGame.status_completed || drawerGame.status_state === "in"
                        ? "Scoring, stats, injuries and rosters"
                        : "Current injuries and full rosters"}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => setDrawerGameId(null)}
                    aria-label="Close details"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="drawer-body">
                  <GameSummary game={drawerGame} />
                  <TeamDetailStack teamIds={[drawerGame.away_team_id, drawerGame.home_team_id]} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
