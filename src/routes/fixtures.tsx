import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty, StatusPill, TeamChipLabel, WinPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { pct, WEEKS, type Team } from "@/lib/survivor";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/fixtures")({
  head: () => ({
    meta: [
      { title: "Fixtures — Survivor Ledger" },
      {
        name: "description",
        content:
          "Week-by-week NFL fixtures with kickoff times, venue, broadcast, weather and both sides' win probabilities for Survivor pool planning.",
      },
      { property: "og:title", content: "Fixtures — Survivor Ledger" },
      {
        property: "og:description",
        content: "Kickoffs, venues, weather and win probabilities for every NFL game this season.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fixtures,
});

const PRIMARY_POSITIONS = ["QB", "RB", "WR", "TE"];

type Injury = {
  id: string;
  team_id: string | null;
  player_name: string | null;
  position: string | null;
  status: string | null;
  detail: string | null;
};

type RosterPlayer = {
  id: string;
  team_id: string | null;
  name: string | null;
  position: string | null;
  jersey_number: string | null;
};

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

function useTeamDetail(teamIds: string[], enabled: boolean) {
  const key = [...teamIds].sort().join(",");
  return useQuery({
    queryKey: ["team-detail", key],
    enabled: enabled && teamIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [inj, ros] = await Promise.all([
        supabase
          .from("injuries")
          .select("id, team_id, player_name, position, status, detail")
          .in("team_id", teamIds),
        supabase
          .from("roster_players")
          .select("id, team_id, name, position, jersey_number")
          .in("team_id", teamIds),
      ]);
      return {
        injuries: (inj.data ?? []) as Injury[],
        roster: (ros.data ?? []) as RosterPlayer[],
      };
    },
  });
}

function TeamPanel({
  team,
  injuries,
  roster,
}: {
  team: Team | undefined;
  injuries: Injury[];
  roster: RosterPlayer[];
}) {
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, RosterPlayer[]>();
    for (const p of roster) {
      const pos = p.position ?? "—";
      const list = map.get(pos) ?? [];
      list.push(p);
      map.set(pos, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }
    const primary = PRIMARY_POSITIONS.filter((p) => map.has(p)).map(
      (p) => [p, map.get(p)!] as const,
    );
    const rest = [...map.entries()]
      .filter(([p]) => !PRIMARY_POSITIONS.includes(p))
      .sort((a, b) => a[0].localeCompare(b[0]));
    return { primary, rest };
  }, [roster]);

  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <TeamChipLabel abbr={team?.abbr} logo={team?.logo_url} name={team?.name} />
      </div>

      <div className="label">Injury report · current status</div>
      <p className="sub" style={{ marginTop: 2 }}>
        Reflects each player's status right now, not their status as of this week's game.
      </p>
      <div className="detail-list">
        {injuries.length === 0 ? (
          <span className="sub">No reported injuries.</span>
        ) : (
            injuries.map((i) => (
              <div key={i.id} className="detail-row injury-row">
                <span style={{ minWidth: 34 }} className="sub">
                  {i.position ?? "—"}
                </span>
                <span
                  className="player-name"
                  style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {i.player_name ?? "Unknown"}
                </span>
                <span className="status-wrap" style={{ flexShrink: 0, marginLeft: "auto" }}>
                  <StatusPill status={i.status} />
                </span>
              </div>
            ))
        )}
      </div>

      <div className="label">Roster</div>
      {groups.primary.map(([pos, players]) => (
        <div key={pos}>
          <div className="sub" style={{ marginTop: 8, fontWeight: 600 }}>
            {pos}
          </div>
          <div className="detail-list">
            {players.map((p) => (
              <div key={p.id} className="detail-row">
                <span className="num">{p.jersey_number ?? "—"}</span>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {groups.rest.length ? (
        <>
          <button className="btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "Hide full roster" : "Show full roster"}
          </button>
          {showAll
            ? groups.rest.map(([pos, players]) => (
                <div key={pos}>
                  <div className="sub" style={{ marginTop: 8, fontWeight: 600 }}>
                    {pos}
                  </div>
                  <div className="detail-list">
                    {players.map((p) => (
                      <div key={p.id} className="detail-row">
                        <span className="num">{p.jersey_number ?? "—"}</span>
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}

function DetailRowPanel({ homeId, awayId }: { homeId: string | null; awayId: string | null }) {
  const { teamsById } = useSurvivor();
  const ids = [homeId, awayId].filter((x): x is string => !!x);
  const { data, isLoading } = useTeamDetail(ids, true);

  if (isLoading) return <Empty>Loading injuries and rosters…</Empty>;

  return (
    <div className="detail-grid">
      {ids.map((id) => (
        <TeamPanel
          key={id}
          team={teamsById.get(id)}
          injuries={(data?.injuries ?? []).filter((i) => i.team_id === id)}
          roster={(data?.roster ?? []).filter((r) => r.team_id === id)}
        />
      ))}
    </div>
  );
}

function Fixtures() {
  const { games, teams, teamsById, plan, loading, currentWeek, setPick } = useSurvivor();
  const isMobile = useIsMobile();
  const [week, setWeek] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawerGameId, setDrawerGameId] = useState<string | null>(null);
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
                  {list.length} games · times shown in your local timezone · click a row for
                  injuries and rosters
                </p>
              </div>
              <select
                className="control"
                aria-label="Filter by team"
                value={teamFilter}
                onChange={(e) => {
                  setTeamFilter(e.target.value);
                  setExpanded(null);
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
                    setExpanded(null);
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
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <Empty>
                          {filterTeamName
                            ? `${filterTeamName} have no game in week ${activeWeek} (bye week).`
                            : "No games scheduled for this week."}
                        </Empty>
                      </td>
                    </tr>
                  ) : (
                    list.map((g) => {
                      const home = g.home_team_id ? teamsById.get(g.home_team_id) : undefined;
                      const away = g.away_team_id ? teamsById.get(g.away_team_id) : undefined;
                      const pickedHome = plan[g.week] === g.home_team_id;
                      const pickedAway = plan[g.week] === g.away_team_id;
                      const open = expanded === g.id;
                      return (
                        <Fragment key={g.id}>
                          <tr
                            className="expandable"
                            onClick={() => {
                              if (isMobile) {
                                setDrawerGameId(g.id);
                              } else {
                                setExpanded(open ? null : g.id);
                              }
                            }}
                            aria-expanded={open}
                          >
                            <td style={{ width: 24 }}>
                              <span className={`chevron${open ? " open" : ""}`} aria-hidden="true">
                                ›
                              </span>
                            </td>
                            <th scope="row" className="sub">
                              {fmtKick(g.kickoff_at)}
                            </th>
                            <td>
                              <TeamChipLabel
                                abbr={away?.abbr}
                                logo={away?.logo_url}
                                name={away?.name}
                              />
                            </td>
                            <td>
                              <TeamChipLabel
                                abbr={home?.abbr}
                                logo={home?.logo_url}
                                name={home?.name}
                              />
                            </td>
                            <td>
                              <WinPill p={g.away_win_prob} />
                            </td>
                            <td>
                              <WinPill p={g.home_win_prob} />
                            </td>
                            <td className="sub">
                              {g.venue_name ?? "—"}
                              {g.venue_city ? ` · ${g.venue_city}` : ""}
                              {g.venue_indoor ? " · indoor" : ""}
                            </td>
                            <td className="sub">{g.broadcast ?? "—"}</td>
                            <td className="sub">
                              {g.weather_condition ?? (g.venue_indoor ? "Climate controlled" : "—")}
                              {g.weather_temp_f != null
                                ? ` · ${Math.round(g.weather_temp_f)}°F`
                                : ""}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2">
                                <button
                                  className={`btn${pickedAway ? " primary" : ""}`}
                                  onClick={() =>
                                    setPick(g.week, pickedAway ? undefined : g.away_team_id ?? undefined)
                                  }
                                  aria-label={`Pick ${away?.abbr} for week ${g.week} (${pct(g.away_win_prob)})`}
                                >
                                  {away?.abbr}
                                </button>
                                <button
                                  className={`btn${pickedHome ? " primary" : ""}`}
                                  onClick={() =>
                                    setPick(g.week, pickedHome ? undefined : g.home_team_id ?? undefined)
                                  }
                                  aria-label={`Pick ${home?.abbr} for week ${g.week} (${pct(g.home_win_prob)})`}
                                >
                                  {home?.abbr}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {!isMobile && open ? (
                            <tr>
                              <td colSpan={10} className="detail-panel">
                                <DetailRowPanel
                                  homeId={g.home_team_id}
                                  awayId={g.away_team_id}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {isMobile && drawerGame ? (
            <div
              className="drawer-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDrawerGameId(null);
              }}
              aria-hidden={!drawerGame}
            >
              <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
                <div className="drawer-head">
                  <h3 id="drawer-title">
                    {teamsById.get(drawerGame.away_team_id ?? "")?.abbr} @{" "}
                    {teamsById.get(drawerGame.home_team_id ?? "")?.abbr}
                  </h3>
                  <button
                    className="icon-btn"
                    onClick={() => setDrawerGameId(null)}
                    aria-label="Close details"
                  >
                    ✕
                  </button>
                </div>
                <div className="drawer-body">
                  <DetailRowPanel
                    homeId={drawerGame.home_team_id}
                    awayId={drawerGame.away_team_id}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
