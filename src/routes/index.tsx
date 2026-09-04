import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SurvivalChart } from "@/components/SurvivalChart";
import { Delta, Empty, StatCard, TeamChipLabel, WinPill } from "@/components/bits";
import { usePlanCurves, useSurvivor } from "@/lib/survivor-store";
import { finalOdds, oddsAsOneInN, pct, ppDelta, WEEKS } from "@/lib/survivor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Season Overview — Survivor Ledger" },
      {
        name: "description",
        content:
          "Forecast your NFL Survivor pool season: survival curve, week-by-week win probabilities, and how each pick change moves your season-long odds.",
      },
      { property: "og:title", content: "Season Overview — Survivor Ledger" },
      {
        property: "og:description",
        content:
          "See your season-long Survivor odds, your ±1σ band, and the cost of every pick you change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SeasonOverview,
});

function SeasonOverview() {
  const { slots, plan, originalPlan, teamsById, loading, currentWeek, editedWeeks, resetPlan } =
    useSurvivor();
  const curves = usePlanCurves();

  const mine = finalOdds(curves.mine);
  const original = finalOdds(curves.original);
  const best = finalOdds(curves.optimal);
  const weakest = [...curves.mine]
    .filter((p) => p.winProb != null)
    .sort((a, b) => (a.winProb ?? 1) - (b.winProb ?? 1))[0];

  return (
    <AppShell title="Season Overview">
      {loading ? (
        <Empty>Loading season data…</Empty>
      ) : (
        <>
          <section className="stat-grid" style={{ marginBottom: 16 }}>
            <StatCard
              label="Season survival odds"
              value={pct(mine, 2)}
              sub={oddsAsOneInN(mine)}
              tone="accent"
            />
            <StatCard
              label="vs. original plan"
              value={<Delta pp={ppDelta(mine, original)} />}
              sub={`Original ${pct(original, 2)}`}
            />
            <StatCard
              label="Optimal ceiling"
              value={pct(best, 2)}
              sub={<>You are {ppDelta(best, mine).toFixed(2)}pp below the best legal plan</>}
              tone="optimal"
            />
            <StatCard
              label="Weakest week"
              value={weakest ? `W${weakest.week}` : "—"}
              sub={
                weakest ? (
                  <>
                    {teamsById.get(weakest.teamId ?? "")?.abbr ?? "—"} · {pct(weakest.winProb)}
                  </>
                ) : (
                  "No picks yet"
                )
              }
              tone="scenario"
            />
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2>Survival curve</h2>
                <p className="sub">
                  Cumulative probability you are still alive entering each week. Log scale — a
                  straight fall means constant weekly risk.
                </p>
              </div>
              {editedWeeks.size > 0 ? (
                <button className="btn" onClick={resetPlan}>
                  Reset {editedWeeks.size} change{editedWeeks.size === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
            <SurvivalChart
              currentWeek={currentWeek}
              band={curves.mine}
              series={[
                { key: "mine", label: "Current plan", color: "var(--accent)", curve: curves.mine },
                {
                  key: "orig",
                  label: "Original plan",
                  color: "var(--scenario)",
                  curve: curves.original,
                  dashed: true,
                },
                {
                  key: "opt",
                  label: "Optimal plan",
                  color: "var(--optimal)",
                  curve: curves.optimal,
                  dashed: true,
                },
              ]}
            />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Week ledger</h2>
                <p className="sub">
                  Every week's pick, its win probability, and the running season odds.
                </p>
              </div>
              <Link to="/comparator" className="btn primary">
                Change a pick
              </Link>
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Pick</th>
                    <th scope="col">Opponent</th>
                    <th scope="col">Win prob</th>
                    <th scope="col">Cumulative</th>
                    <th scope="col">vs. original</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKS.map((w, i) => {
                    const point = curves.mine[i]!;
                    const orig = curves.original[i]!;
                    const team = point.teamId ? teamsById.get(point.teamId) : undefined;
                    const opp = point.opponentId ? teamsById.get(point.opponentId) : undefined;
                    const slot = point.teamId ? slots.get(w)?.get(point.teamId) : undefined;
                    return (
                      <tr key={w} style={editedWeeks.has(w) ? { background: "var(--surface-2)" } : undefined}>
                        <th scope="row" className="num">
                          {w}
                          {editedWeeks.has(w) ? (
                            <span className="pill scenario" style={{ marginLeft: 6 }}>
                              edited
                            </span>
                          ) : null}
                        </th>
                        <td>
                          <TeamChipLabel
                            abbr={team?.abbr}
                            logo={team?.logo_url}
                            name={team?.name}
                          />
                        </td>
                        <td className="sub">
                          {opp ? `${slot?.isHome ? "vs" : "@"} ${opp.abbr}` : "—"}
                        </td>
                        <td>
                          <WinPill p={point.winProb} />
                        </td>
                        <td className="num">{pct(point.cumulative, 2)}</td>
                        <td>
                          <Delta pp={ppDelta(point.cumulative, orig.cumulative)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
