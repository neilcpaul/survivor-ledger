import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty, StatCard, TeamChipLabel, WinPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { byeWeeks, pct, WEEKS } from "@/lib/survivor";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Team Inventory — Survivor Ledger" },
      {
        name: "description",
        content:
          "Track which NFL teams you have spent, which remain, their bye weeks, and the best week left to use each surviving team.",
      },
      { property: "og:title", content: "Team Inventory — Survivor Ledger" },
      {
        property: "og:description",
        content: "Which Survivor teams are spent, which remain, and where each one is worth most.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inventory,
});

type SortKey = "best" | "abbr" | "spent";

function Inventory() {
  const { teams, slots, plan, teamsById, loading, currentWeek } = useSurvivor();
  const [sort, setSort] = useState<SortKey>("best");
  const [filter, setFilter] = useState<"all" | "available" | "spent">("all");

  const usedWeekByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of WEEKS) {
      const t = plan[w];
      if (t) m.set(t, w);
    }
    return m;
  }, [plan]);

  const rows = useMemo(() => {
    const list = teams.map((team) => {
      const usedWeek = usedWeekByTeam.get(team.id);
      const remaining = WEEKS.filter((w) => w >= currentWeek && !plan[w]).map((w) =>
        slots.get(w)?.get(team.id),
      );
      const bestSlot = remaining
        .filter(Boolean)
        .sort((a, b) => b!.winProb - a!.winProb)[0];
      const byes = byeWeeks(slots, team.id);
      const played = WEEKS.map((w) => slots.get(w)?.get(team.id)).filter(Boolean);
      const avg = played.length
        ? played.reduce((sum, s) => sum + s!.winProb, 0) / played.length
        : null;
      return { team, usedWeek, bestSlot, byes, avg };
    });

    const filtered = list.filter((r) =>
      filter === "all" ? true : filter === "spent" ? r.usedWeek != null : r.usedWeek == null,
    );

    return filtered.sort((a, b) => {
      if (sort === "abbr") return (a.team.abbr ?? "").localeCompare(b.team.abbr ?? "");
      if (sort === "spent") return (a.usedWeek ?? 99) - (b.usedWeek ?? 99);
      return (b.bestSlot?.winProb ?? -1) - (a.bestSlot?.winProb ?? -1);
    });
  }, [teams, slots, plan, usedWeekByTeam, sort, filter, currentWeek]);

  const spentCount = usedWeekByTeam.size;

  return (
    <AppShell title="Team Inventory">
      {loading ? (
        <Empty>Loading teams…</Empty>
      ) : (
        <>
          <section className="stat-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Teams committed" value={spentCount} sub="Across all 18 weeks" tone="scenario" />
            <StatCard label="Teams still free" value={teams.length - spentCount} sub="Never used in your plan" tone="accent" />
            <StatCard
              label="Weeks unassigned"
              value={WEEKS.filter((w) => !plan[w]).length}
              sub="No pick set yet"
            />
            <StatCard
              label="Strongest team left"
              value={rows.find((r) => !r.usedWeek)?.team.abbr ?? "—"}
              sub={
                rows.find((r) => !r.usedWeek)?.bestSlot
                  ? `Best in W${rows.find((r) => !r.usedWeek)!.bestSlot!.week} · ${pct(rows.find((r) => !r.usedWeek)!.bestSlot!.winProb)}`
                  : "No open weeks"
              }
              tone="optimal"
            />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>All 32 teams</h2>
                <p className="sub">
                  A team spent in week 3 is gone for the rest of the season — this is where you see
                  what that costs you later.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="label" htmlFor="inv-filter">
                  Show
                </label>
                <select
                  id="inv-filter"
                  className="control"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                >
                  <option value="all">All teams</option>
                  <option value="available">Still available</option>
                  <option value="spent">Already committed</option>
                </select>
                <label className="label" htmlFor="inv-sort">
                  Sort
                </label>
                <select
                  id="inv-sort"
                  className="control"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                >
                  <option value="best">Best remaining spot</option>
                  <option value="abbr">Team A–Z</option>
                  <option value="spent">Week committed</option>
                </select>
              </div>
            </div>

            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Division</th>
                    <th scope="col">Status</th>
                    <th scope="col">Bye</th>
                    <th scope="col">Avg. win prob</th>
                    <th scope="col">Best remaining week</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ team, usedWeek, bestSlot, byes, avg }) => (
                    <tr key={team.id} style={usedWeek ? { opacity: 0.62 } : undefined}>
                      <th scope="row">
                        <TeamChipLabel abbr={team.abbr} logo={team.logo_url} name={team.name} />
                      </th>
                      <td className="sub">
                        {team.conference ?? "—"} {team.division ?? ""}
                      </td>
                      <td>
                        {usedWeek ? (
                          <span className="pill neutral">Spent · W{usedWeek}</span>
                        ) : (
                          <span className="pill accent">Available</span>
                        )}
                      </td>
                      <td className="num sub">{byes.length ? byes.join(", ") : "—"}</td>
                      <td className="num">{pct(avg)}</td>
                      <td>
                        {usedWeek ? (
                          <span className="sub">—</span>
                        ) : bestSlot ? (
                          <span className="flex items-center gap-2">
                            <span className="num">W{bestSlot.week}</span>
                            <span className="sub">
                              {bestSlot.isHome ? "vs" : "@"}{" "}
                              {teamsById.get(bestSlot.opponentId ?? "")?.abbr ?? "—"}
                            </span>
                            <WinPill p={bestSlot.winProb} />
                          </span>
                        ) : (
                          <span className="sub">No open week left</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
