import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty, TeamChipLabel, WinPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { pct, WEEKS } from "@/lib/survivor";

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
  const { games, teamsById, plan, loading, currentWeek, setPick } = useSurvivor();
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? currentWeek;

  const list = useMemo(
    () =>
      games
        .filter((g) => g.week === activeWeek)
        .sort((a, b) => (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? "")),
    [games, activeWeek],
  );

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
                  {list.length} games · times shown in your local timezone
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKS.map((w) => (
                <button
                  key={w}
                  className={`btn${w === activeWeek ? " primary" : ""}`}
                  onClick={() => setWeek(w)}
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
                      <td colSpan={9}>
                        <Empty>No games scheduled for this week.</Empty>
                      </td>
                    </tr>
                  ) : (
                    list.map((g) => {
                      const home = g.home_team_id ? teamsById.get(g.home_team_id) : undefined;
                      const away = g.away_team_id ? teamsById.get(g.away_team_id) : undefined;
                      const pickedHome = plan[g.week] === g.home_team_id;
                      const pickedAway = plan[g.week] === g.away_team_id;
                      return (
                        <tr key={g.id}>
                          <th scope="row" className="sub">
                            {fmtKick(g.kickoff_at)}
                          </th>
                          <td>
                            <TeamChipLabel abbr={away?.abbr} logo={away?.logo_url} name={away?.name} />
                          </td>
                          <td>
                            <TeamChipLabel abbr={home?.abbr} logo={home?.logo_url} name={home?.name} />
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
                            {g.weather_temp_f != null ? ` · ${Math.round(g.weather_temp_f)}°F` : ""}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button
                                className={`btn${pickedAway ? " primary" : ""}`}
                                onClick={() => setPick(g.week, pickedAway ? undefined : g.away_team_id ?? undefined)}
                                aria-label={`Pick ${away?.abbr} for week ${g.week} (${pct(g.away_win_prob)})`}
                              >
                                {away?.abbr}
                              </button>
                              <button
                                className={`btn${pickedHome ? " primary" : ""}`}
                                onClick={() => setPick(g.week, pickedHome ? undefined : g.home_team_id ?? undefined)}
                                aria-label={`Pick ${home?.abbr} for week ${g.week} (${pct(g.home_win_prob)})`}
                              >
                                {home?.abbr}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
