import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { pct, seqColor, WEEKS } from "@/lib/survivor";

export const Route = createFileRoute("/heatmap")({
  head: () => ({
    meta: [
      { title: "Matchup Heatmap — Survivor Ledger" },
      {
        name: "description",
        content:
          "A 32-team by 18-week grid of NFL win probabilities so you can spot the safest Survivor weeks and plan around bye weeks.",
      },
      { property: "og:title", content: "Matchup Heatmap — Survivor Ledger" },
      {
        property: "og:description",
        content: "Every team, every week, colour-coded by win probability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Heatmap,
});

function Heatmap() {
  const { teams, slots, plan, teamsById, loading, setPick, currentWeek } = useSurvivor();
  const [conf, setConf] = useState<"all" | "AFC" | "NFC">("all");

  const usedWeekByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of WEEKS) if (plan[w]) m.set(plan[w]!, w);
    return m;
  }, [plan]);

  const shown = useMemo(
    () =>
      teams
        .filter((t) => conf === "all" || t.conference === conf)
        .sort((a, b) => (a.abbr ?? "").localeCompare(b.abbr ?? "")),
    [teams, conf],
  );

  return (
    <AppShell title="Matchup Heatmap">
      {loading ? (
        <Empty>Loading matchups…</Empty>
      ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Win probability grid</h2>
              <p className="sub">
                Darker means a safer game. Click any cell to make that team your pick for that week
                — the pick is released from whatever week it was in.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="label" htmlFor="hm-conf">
                Conference
              </label>
              <select
                id="hm-conf"
                className="control"
                value={conf}
                onChange={(e) => setConf(e.target.value as typeof conf)}
              >
                <option value="all">Both</option>
                <option value="AFC">AFC</option>
                <option value="NFC">NFC</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 12 }}>
            <span className="label">Legend</span>
            {[0.4, 0.55, 0.7, 0.85, 0.95].map((v) => (
              <span
                key={v}
                className="badge"
                style={{ background: seqColor(v), color: v > 0.7 ? "var(--on-seq)" : "var(--ink)" }}
              >
                {pct(v, 0)}
              </span>
            ))}
            <span className="badge">◆ your pick</span>
            <span className="badge">— bye week</span>
          </div>

          <div className="scroll-x">
            <table className="grid" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ position: "sticky", left: 0, background: "var(--surface)" }}>
                    Team
                  </th>
                  {WEEKS.map((w) => (
                    <th key={w} scope="col" className="num" style={{ textAlign: "center" }}>
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((team) => {
                  const usedWeek = usedWeekByTeam.get(team.id);
                  return (
                    <tr key={team.id}>
                      <th
                        scope="row"
                        className="num"
                        style={{ position: "sticky", left: 0, background: "var(--surface)" }}
                      >
                        {team.abbr}
                      </th>
                      {WEEKS.map((w) => {
                        const slot = slots.get(w)?.get(team.id);
                        const picked = plan[w] === team.id;
                        const blockedByTeam = usedWeek != null && usedWeek !== w;
                        if (!slot)
                          return (
                            <td key={w} style={{ textAlign: "center", color: "var(--ink-3)" }}>
                              —
                            </td>
                          );
                        const opp = teamsById.get(slot.opponentId ?? "")?.abbr ?? "?";
                        const label = `${team.abbr} week ${w} ${slot.isHome ? "vs" : "at"} ${opp}, ${pct(slot.winProb)} win probability${picked ? ", current pick" : ""}`;
                        return (
                          <td key={w} style={{ padding: 3, textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => setPick(w, picked ? undefined : team.id)}
                              aria-label={label}
                              title={label}
                              style={{
                                width: "100%",
                                minWidth: 40,
                                padding: "6px 2px",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontVariantNumeric: "tabular-nums",
                                fontSize: 11,
                                background: seqColor(slot.winProb),
                                color: slot.winProb > 0.7 ? "var(--on-seq)" : "var(--ink)",
                                border: picked
                                  ? "2px solid var(--scenario)"
                                  : w < currentWeek
                                    ? "1px solid transparent"
                                    : "1px solid var(--border)",
                                opacity: blockedByTeam ? 0.4 : 1,
                              }}
                            >
                              {picked ? "◆ " : ""}
                              {(slot.winProb * 100).toFixed(0)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
