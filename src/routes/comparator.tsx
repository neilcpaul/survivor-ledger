import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SurvivalChart } from "@/components/SurvivalChart";
import { Delta, Empty, StatCard, TeamChipLabel, WinPill } from "@/components/bits";
import { usePlanCurves, useSurvivor } from "@/lib/survivor-store";
import {
  eligibleTeams,
  finalOdds,
  oddsAsOneInN,
  pct,
  ppDelta,
  survivalCurve,
  WEEKS,
} from "@/lib/survivor";

export const Route = createFileRoute("/comparator")({
  head: () => ({
    meta: [
      { title: "Pick Comparator — Survivor Ledger" },
      {
        name: "description",
        content:
          "Swap any weekly Survivor pick and instantly see the season-long odds change in percentage points, including knock-on effects in later weeks.",
      },
      { property: "og:title", content: "Pick Comparator — Survivor Ledger" },
      {
        property: "og:description",
        content: "What happens to your season odds if you change this pick?",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Comparator,
});

function Comparator() {
  const { slots, plan, teamsById, loading, setPick, currentWeek, editedWeeks, resetPlan, optimal } =
    useSurvivor();
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? currentWeek;
  const curves = usePlanCurves();

  const options = useMemo(
    () => eligibleTeams(slots, plan, activeWeek),
    [slots, plan, activeWeek],
  );

  const baseline = finalOdds(curves.mine);

  const scored = useMemo(
    () =>
      options.map((slot) => {
        const candidate = { ...plan, [activeWeek]: slot.teamId };
        const odds = finalOdds(survivalCurve(slots, candidate));
        return { slot, odds, delta: ppDelta(odds, baseline) };
      }),
    [options, plan, activeWeek, slots, baseline],
  );

  const bestAlt = scored.filter((s) => plan[activeWeek] !== s.slot.teamId).sort((a, b) => b.odds - a.odds)[0];
  const currentTeam = plan[activeWeek] ? teamsById.get(plan[activeWeek]!) : undefined;
  const previewCurve = bestAlt
    ? survivalCurve(slots, { ...plan, [activeWeek]: bestAlt.slot.teamId })
    : curves.mine;

  return (
    <AppShell title="Pick Comparator">
      {loading ? (
        <Empty>Loading forecast…</Empty>
      ) : (
        <>
          <section className="stat-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Current season odds" value={pct(baseline, 2)} sub={oddsAsOneInN(baseline)} tone="accent" />
            <StatCard
              label={`Week ${activeWeek} pick`}
              value={currentTeam?.abbr ?? "—"}
              sub={pct(slots.get(activeWeek)?.get(plan[activeWeek] ?? "")?.winProb)}
            />
            <StatCard
              label="Best swap available"
              value={bestAlt?.slot.teamId ? teamsById.get(bestAlt.slot.teamId)?.abbr ?? "—" : "—"}
              sub={bestAlt ? <Delta pp={bestAlt.delta} /> : "No alternatives"}
              tone="optimal"
            />
            <StatCard
              label="Changes made"
              value={editedWeeks.size}
              sub={editedWeeks.size ? `Weeks ${[...editedWeeks].join(", ")}` : "Matches original plan"}
              tone="scenario"
            />
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2>Choose a week</h2>
                <p className="sub">
                  Every alternative below is re-scored across the whole remaining season, not just
                  this game.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editedWeeks.size ? (
                  <button className="btn" onClick={resetPlan}>
                    Reset plan
                  </button>
                ) : null}
                <button
                  className="btn primary"
                  onClick={() => {
                    for (const w of WEEKS) if (optimal[w]) setPick(w, optimal[w]);
                  }}
                >
                  Apply optimal plan
                </button>
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
                  {editedWeeks.has(w) ? " •" : ""}
                </button>
              ))}
            </div>
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2>Week {activeWeek} alternatives</h2>
                <p className="sub">
                  Teams already committed to another week are excluded — that is the season-long
                  constraint doing its job.
                </p>
              </div>
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Matchup</th>
                    <th scope="col">Win prob</th>
                    <th scope="col">Season odds if picked</th>
                    <th scope="col">Change</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <Empty>No eligible teams left for this week.</Empty>
                      </td>
                    </tr>
                  ) : (
                    scored
                      .sort((a, b) => b.odds - a.odds)
                      .map(({ slot, odds, delta }) => {
                        const team = teamsById.get(slot.teamId);
                        const isCurrent = plan[activeWeek] === slot.teamId;
                        return (
                          <tr
                            key={slot.teamId}
                            style={isCurrent ? { background: "var(--surface-2)" } : undefined}
                          >
                            <th scope="row">
                              <TeamChipLabel abbr={team?.abbr} logo={team?.logo_url} name={team?.name} />
                            </th>
                            <td className="sub">
                              {slot.isHome ? "vs" : "@"}{" "}
                              {teamsById.get(slot.opponentId ?? "")?.abbr ?? "—"}
                            </td>
                            <td>
                              <WinPill p={slot.winProb} />
                            </td>
                            <td className="num">{pct(odds, 2)}</td>
                            <td>
                              <Delta pp={delta} />
                            </td>
                            <td>
                              {isCurrent ? (
                                <span className="pill accent">Current pick</span>
                              ) : (
                                <button className="btn" onClick={() => setPick(activeWeek, slot.teamId)}>
                                  Use this
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Scenario preview</h2>
                <p className="sub">
                  Your current plan against the best available swap for week {activeWeek}.
                </p>
              </div>
            </div>
            <SurvivalChart
              currentWeek={activeWeek}
              series={[
                { key: "mine", label: "Current plan", color: "var(--accent)", curve: curves.mine },
                {
                  key: "alt",
                  label: bestAlt
                    ? `Swap to ${teamsById.get(bestAlt.slot.teamId)?.abbr}`
                    : "No swap available",
                  color: "var(--scenario)",
                  curve: previewCurve,
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
        </>
      )}
    </AppShell>
  );
}
