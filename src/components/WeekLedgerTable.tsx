import { Delta, TeamChipLabel, WinPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { pct, ppDelta, WEEKS, type CurvePoint } from "@/lib/survivor";

/**
 * The Week Ledger table. Values are always derived from the live curves passed
 * in, never a stored snapshot, so the read-only admin view shows exactly the
 * numbers the entry's own owner sees.
 */
export function WeekLedgerTable({
  curve,
  originalCurve,
  originalLocked,
  editedWeeks,
}: {
  curve: CurvePoint[];
  originalCurve: CurvePoint[];
  originalLocked: boolean;
  editedWeeks?: Set<number>;
}) {
  const { teamsById, slots } = useSurvivor();
  const edited = editedWeeks ?? new Set<number>();

  return (
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
            const point = curve[i]!;
            const orig = originalCurve[i]!;
            const team = point.teamId ? teamsById.get(point.teamId) : undefined;
            const opp = point.opponentId ? teamsById.get(point.opponentId) : undefined;
            const slot = point.teamId ? slots.get(w)?.get(point.teamId) : undefined;
            return (
              <tr key={w} style={edited.has(w) ? { background: "var(--surface-2)" } : undefined}>
                <th scope="row" className="num">
                  {w}
                  {edited.has(w) ? (
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
                    teamId={team?.id}
                  />
                </td>
                <td className="sub">{opp ? `${slot?.isHome ? "vs" : "@"} ${opp.abbr}` : "—"}</td>
                <td>
                  <WinPill p={point.winProb} />
                </td>
                <td className="num">
                  {curve.slice(0, i + 1).some((p) => p.winProb != null)
                    ? pct(point.cumulative, 2)
                    : "—"}
                </td>
                <td>
                  {originalLocked ? <Delta pp={ppDelta(point.cumulative, orig.cumulative)} /> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
