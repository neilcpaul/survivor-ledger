import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { SurvivalChart } from "@/components/SurvivalChart";
import { Delta, Empty, StatCard, TeamChipLabel, WinPill } from "@/components/bits";
import { usePlanCurves, useSurvivor } from "@/lib/survivor-store";
import { getOptimalPlan } from "@/lib/access.functions";
import {
  eligibleTeams,
  exactBand,
  finalOdds,
  oddsAsOneInN,
  pct,
  ppDelta,
  survivalCurve,
  WEEKS,
  type Plan,
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

/* ----------------------------- strategy model ---------------------------- */

type Shape = "conservative" | "balanced" | "aggressive";
type Strategy = "max" | "safe-risk" | "balanced-safe" | "custom";

const SHAPE_WEIGHT: Record<Shape, number> = {
  conservative: 1.6,
  balanced: 1.0,
  aggressive: 0.6,
};

const SHAPE_LABEL: Record<Shape, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

const STRATEGIES: { key: Strategy; label: string; hint: string }[] = [
  { key: "max", label: "Maximum survival", hint: "Uniform weighting — the plain best legal plan" },
  { key: "safe-risk", label: "Safe start → risk finish", hint: "Conservative · Balanced · Aggressive" },
  { key: "balanced-safe", label: "Balanced start → safe finish", hint: "Balanced · Balanced · Conservative" },
  { key: "custom", label: "Custom", hint: "Set your own shape and boundaries" },
];

/** Per-week cost weights (index 0 = week 1) from three weighted segments. */
function buildWeights(bounds: [number, number], shapes: [Shape, Shape, Shape]): number[] {
  const [b1, b2] = bounds;
  return WEEKS.map((w) => {
    const shape = w <= b1 ? shapes[0] : w <= b2 ? shapes[1] : shapes[2];
    return SHAPE_WEIGHT[shape];
  });
}

const UNIFORM = WEEKS.map(() => 1);

function Comparator() {
  const {
    slots,
    plan,
    teams,
    teamsById,
    loading,
    setPick,
    currentWeek,
    editedWeeks,
    resetPlan,
    optimal,
    isAnalysis,
    originalLocked,
    otherEntryPlans,
  } = useSurvivor();
  const otherCurves = useMemo(
    () => otherEntryPlans.map((e) => ({ ...e, curve: survivalCurve(slots, e.plan) })),
    [otherEntryPlans, slots],
  );
  const ENTRY_COLORS = ["var(--scenario)", "var(--optimal)", "var(--proposed)", "var(--seq-high)"];

  const navigate = useNavigate();

  // Alternatives are scored against the optimal solver, so this page is
  // analysis-only; anyone else who lands here goes back to the overview.
  useEffect(() => {
    if (!isAnalysis) void navigate({ to: "/" });
  }, [isAnalysis, navigate]);
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? currentWeek;
  const curves = usePlanCurves();

  /* -------------------------- strategy controls -------------------------- */
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [bounds, setBounds] = useState<[number, number]>([6, 12]);
  const [shapes, setShapes] = useState<[Shape, Shape, Shape]>([
    "conservative",
    "balanced",
    "aggressive",
  ]);
  // week -> proposed team id, or null for "no pick". Manual edits and rejects.
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});

  const weights = useMemo<number[]>(() => {
    if (strategy === "max" || strategy == null) return UNIFORM;
    if (strategy === "safe-risk") {
      return buildWeights([6, 12], ["conservative", "balanced", "aggressive"]);
    }
    if (strategy === "balanced-safe") {
      return buildWeights([6, 12], ["balanced", "balanced", "conservative"]);
    }
    return buildWeights(bounds, shapes);
  }, [strategy, bounds, shapes]);

  // Custom dials fire a lot of intermediate clicks/drags — settle first.
  const [debouncedWeights, setDebouncedWeights] = useState<number[]>(UNIFORM);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedWeights(weights), 300);
    return () => clearTimeout(t);
  }, [weights]);

  const weightKey = debouncedWeights.join(",");
  const solverQ = useQuery({
    queryKey: ["strategy-plan", weightKey],
    enabled: isAnalysis && strategy != null && strategy !== "max",
    staleTime: 5 * 60_000,
    queryFn: async () => (await getOptimalPlan({ data: { weights: debouncedWeights } })).plan ?? {},
  });

  const basePlan = useMemo<Plan>(() => {
    if (strategy == null) return {};
    if (strategy === "max") return optimal;
    return solverQ.data ?? {};
  }, [strategy, optimal, solverQ.data]);

  const proposed = useMemo<Plan>(() => {
    if (strategy == null) return {};
    const next: Plan = { ...basePlan };
    for (const [w, teamId] of Object.entries(overrides)) {
      if (teamId) next[Number(w)] = teamId;
      else delete next[Number(w)];
    }
    return next;
  }, [strategy, basePlan, overrides]);

  const pendingWeeks = useMemo(
    () => (strategy == null ? [] : WEEKS.filter((w) => (proposed[w] ?? null) !== (plan[w] ?? null))),
    [strategy, proposed, plan],
  );
  const hasProposal = strategy != null && pendingWeeks.length > 0;

  const proposedCurve = useMemo(() => survivalCurve(slots, proposed), [slots, proposed]);
  const proposedOdds = finalOdds(proposedCurve);
  const maxOdds = finalOdds(survivalCurve(slots, optimal));

  /* --------------------------- accept / reject --------------------------- */

  const selectStrategy = useCallback((key: Strategy) => {
    setStrategy(key);
    setOverrides({});
  }, []);

  // Same release rule as the Week Ledger and the Matchup Heatmap: a team can
  // only occupy one week, so assigning it anywhere clears its other week.
  const setProposedPick = useCallback(
    (w: number, teamId: string | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        next[w] = teamId;
        if (teamId) {
          for (const other of WEEKS) {
            if (other === w) continue;
            const cur = other in next ? next[other] : (basePlan[other] ?? null);
            if (cur === teamId) next[other] = null;
          }
        }
        return next;
      });
    },
    [basePlan],
  );

  const acceptWeek = useCallback(
    (w: number) => {
      const teamId = proposed[w] ?? undefined;
      // Committing releases the team from any other week of the working plan…
      if (teamId) {
        for (const other of WEEKS) {
          if (other !== w && plan[other] === teamId) setPick(other, undefined);
        }
      }
      setPick(w, teamId);
      // …and from any other week still pending in this proposal.
      setOverrides((prev) => {
        const next = { ...prev, [w]: teamId ?? null };
        if (teamId) {
          for (const other of WEEKS) {
            if (other === w) continue;
            const cur = other in next ? next[other] : (basePlan[other] ?? null);
            if (cur === teamId) next[other] = null;
          }
        }
        return next;
      });
    },
    [proposed, setPick, basePlan, plan],
  );

  const rejectWeek = useCallback(
    (w: number) => setOverrides((prev) => ({ ...prev, [w]: plan[w] ?? null })),
    [plan],
  );

  const acceptAll = useCallback(() => {
    // Weeks whose current team is reused elsewhere in the proposal must be
    // cleared, so a team never ends up double-booked in the saved plan.
    const target = new Set(pendingWeeks.map((w) => proposed[w]).filter(Boolean) as string[]);
    for (const w of WEEKS) {
      if (pendingWeeks.includes(w)) continue;
      const cur = plan[w];
      if (cur && target.has(cur)) setPick(w, undefined);
    }
    for (const w of pendingWeeks) setPick(w, proposed[w] ?? undefined);
    setOverrides(() => {
      const next: Record<number, string | null> = {};
      for (const w of WEEKS) next[w] = proposed[w] ?? null;
      return next;
    });
  }, [pendingWeeks, proposed, setPick, plan]);


  const rejectAll = useCallback(() => {
    setStrategy(null);
    setOverrides({});
  }, []);

  /* ---------------------- week-by-week alternatives ---------------------- */

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

  const segments: { label: string; index: 0 | 1 | 2 }[] = [
    { label: `Weeks 1–${bounds[0]}`, index: 0 },
    { label: `Weeks ${bounds[0] + 1}–${bounds[1]}`, index: 1 },
    { label: `Weeks ${bounds[1] + 1}–18`, index: 2 },
  ];

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
                <h2>Strategy</h2>
                <p className="sub">
                  Shape how much each part of the season is allowed to gamble. Nothing is saved
                  until you accept a week below.
                </p>
              </div>
              {editedWeeks.size ? (
                <button className="btn" onClick={resetPlan}>
                  Reset plan
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Strategy">
              {STRATEGIES.map((s) => (
                <button
                  key={s.key}
                  className={`btn${strategy === s.key ? " primary" : ""}`}
                  aria-pressed={strategy === s.key}
                  title={s.hint}
                  onClick={() => selectStrategy(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {strategy === "custom" ? (
              <div className="strategy-custom" style={{ marginTop: 12 }}>
                <div className="flex flex-wrap gap-3">
                  {segments.map((seg) => (
                    <div key={seg.index} className="segment-dial">
                      <div className="label">{seg.label}</div>
                      <div className="flex gap-1" role="group" aria-label={`${seg.label} risk`}>
                        {(Object.keys(SHAPE_LABEL) as Shape[]).map((sh) => (
                          <button
                            key={sh}
                            className={`btn${shapes[seg.index] === sh ? " primary" : ""}`}
                            aria-pressed={shapes[seg.index] === sh}
                            onClick={() =>
                              setShapes((prev) => {
                                const next = [...prev] as [Shape, Shape, Shape];
                                next[seg.index] = sh;
                                return next;
                              })
                            }
                          >
                            {SHAPE_LABEL[sh]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="label">Segment boundaries</div>
                  <div className="range-pair">
                    <label className="sub" htmlFor="bound-1">
                      First boundary (week {bounds[0]})
                    </label>
                    <input
                      id="bound-1"
                      type="range"
                      min={1}
                      max={16}
                      step={1}
                      value={bounds[0]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setBounds(([, b2]) => [v, Math.max(v + 1, b2)]);
                      }}
                    />
                    <label className="sub" htmlFor="bound-2">
                      Second boundary (week {bounds[1]})
                    </label>
                    <input
                      id="bound-2"
                      type="range"
                      min={2}
                      max={17}
                      step={1}
                      value={bounds[1]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setBounds(([b1]) => [Math.min(b1, v - 1), v]);
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {strategy != null ? (
              <p className="sub" style={{ marginTop: 12 }} aria-live="polite">
                {solverQ.isFetching && strategy !== "max" ? (
                  "Recomputing…"
                ) : (
                  <>
                    This strategy: <strong>{pct(proposedOdds, 2)}</strong> · Maximum survival:{" "}
                    <strong>{pct(maxOdds, 2)}</strong>
                  </>
                )}
              </p>
            ) : null}
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

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2>Full season plan</h2>
                <p className="sub">
                  {strategy == null
                    ? "Pick a strategy above to stage a proposed plan here."
                    : "Staged only — nothing is saved until you accept a week."}
                </p>
              </div>
              {hasProposal ? (
                <div className="flex items-center gap-2">
                  <button className="btn primary" onClick={acceptAll}>
                    Accept all ({pendingWeeks.length})
                  </button>
                  <button className="btn" onClick={rejectAll}>
                    Reject all
                  </button>
                </div>
              ) : null}
            </div>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Current pick</th>
                    <th scope="col">Proposed pick</th>
                    <th scope="col">Win prob (current)</th>
                    <th scope="col">Win prob (proposed)</th>
                    <th scope="col">Δ</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKS.map((w) => {
                    const curId = plan[w];
                    const propId = proposed[w];
                    const changed = strategy != null && (propId ?? null) !== (curId ?? null);
                    const curTeam = curId ? teamsById.get(curId) : undefined;
                    const propTeam = propId ? teamsById.get(propId) : undefined;
                    const curP = curId ? (slots.get(w)?.get(curId)?.winProb ?? null) : null;
                    const propP = propId ? (slots.get(w)?.get(propId)?.winProb ?? null) : null;
                    const weekOptions = eligibleTeams(slots, proposed, w);
                    return (
                      <tr key={w} style={changed ? { background: "var(--surface-2)" } : undefined}>
                        <th scope="row" className="num">
                          {w}
                        </th>
                        <td>
                          <TeamChipLabel abbr={curTeam?.abbr} logo={curTeam?.logo_url} teamId={curTeam?.id} />
                        </td>
                        <td>
                          {strategy == null ? (
                            <span className="sub">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span style={changed ? undefined : { opacity: 0.45 }}>
                                {changed ? (
                                  <TeamChipLabel
                                    abbr={propTeam?.abbr}
                                    logo={propTeam?.logo_url}
                                    teamId={propTeam?.id}
                                  />
                                ) : (
                                  <span className="sub">no change</span>
                                )}
                              </span>
                              <select
                                className="control"
                                aria-label={`Proposed pick for week ${w}`}
                                value={propId ?? ""}
                                onChange={(e) => setProposedPick(w, e.target.value || null)}
                              >
                                <option value="">No pick</option>
                                {propId && !weekOptions.some((s) => s.teamId === propId) ? (
                                  <option value={propId}>{propTeam?.abbr ?? "—"}</option>
                                ) : null}
                                {weekOptions.map((s) => (
                                  <option key={s.teamId} value={s.teamId}>
                                    {teamsById.get(s.teamId)?.abbr} · {pct(s.winProb)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td>
                          <WinPill p={curP} />
                        </td>
                        <td>{changed ? <WinPill p={propP} /> : <span className="sub">—</span>}</td>
                        <td>
                          {changed ? (
                            <Delta pp={ppDelta(propP ?? 0, curP ?? 0)} />
                          ) : (
                            <span className="sub">—</span>
                          )}
                        </td>
                        <td>
                          {changed ? (
                            <div className="flex items-center gap-2">
                              <button className="btn primary" onClick={() => acceptWeek(w)}>
                                Accept
                              </button>
                              <button className="btn" onClick={() => rejectWeek(w)}>
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="sub">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {teams.length === 0 ? <Empty>No teams loaded.</Empty> : null}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Scenario preview</h2>
                <p className="sub">
                  Your current plan against the best available swap for week {activeWeek}
                  {hasProposal ? ", plus the staged proposed plan and its exact ±1σ band" : ""}.
                </p>
              </div>
            </div>
            <SurvivalChart
              currentWeek={activeWeek}
              {...(hasProposal ? { band: exactBand(proposedCurve) } : {})}
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
                ...(originalLocked
                  ? [
                      {
                        key: "orig",
                        label: "Original plan",
                        color: "var(--seq-high)",
                        curve: curves.original,
                        dashed: true,
                      },
                    ]
                  : []),

                ...otherCurves.map((e, i) => ({
                  key: `entry-${e.id}`,
                  label: e.name,
                  color: ENTRY_COLORS[i % ENTRY_COLORS.length]!,
                  curve: e.curve,
                })),
                ...(hasProposal
                  ? [
                      {
                        key: "proposed",
                        label: "Proposed plan",
                        color: "var(--proposed)",
                        curve: proposedCurve,
                        dashed: true,
                      },
                    ]
                  : []),

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
