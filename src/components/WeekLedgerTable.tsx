import { useState } from "react";
import { Pencil } from "lucide-react";
import { Delta, GamePill, ResultPill, TeamChipLabel, WinPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import {
  closeCallNote,
  gameState,
  pct,
  pickOutcome,
  ppDelta,
  upsetNote,
  WEEKS,
  type CurvePoint,
} from "@/lib/survivor";

/**
 * The Week Ledger table. Values are always derived from the live curves passed
 * in, never a stored snapshot, so the read-only admin view shows exactly the
 * numbers the entry's own owner sees.
 *
 * Past weeks show what happened and keep the pre-game probability as a quiet
 * secondary figure; they stay editable (a real pool entry may have differed)
 * but editing is deliberately behind an explicit affordance.
 */
export function WeekLedgerTable({
  curve,
  originalCurve,
  originalLocked,
  editedWeeks,
  readOnly = false,
}: {
  curve: CurvePoint[];
  originalCurve: CurvePoint[];
  originalLocked: boolean;
  editedWeeks?: Set<number>;
  readOnly?: boolean;
}) {
  const { teamsById, slots, gamesByWeekTeam, currentWeek, setPick } = useSurvivor();
  const edited = editedWeeks ?? new Set<number>();
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <>
      <p className="sub" style={{ marginBottom: 8 }}>
        Past weeks stay editable — change them if your real entry differed.
      </p>
      <div className="scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Pick</th>
              <th scope="col">Opponent</th>
              <th scope="col">Result</th>
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
              const game = point.teamId ? gamesByWeekTeam.get(`${w}:${point.teamId}`) : undefined;
              const state = game ? gameState(game) : "pre";
              const outcome = pickOutcome(game, point.teamId);
              const isPast = w < currentWeek || outcome != null;
              const isNow = w === currentWeek && !outcome;
              const kickedOff = isNow && state !== "pre";
              const mineScore =
                game && point.teamId
                  ? game.home_team_id === point.teamId
                    ? game.home_score
                    : game.away_score
                  : null;
              const theirScore =
                game && point.teamId
                  ? game.home_team_id === point.teamId
                    ? game.away_score
                    : game.home_score
                  : null;
              const note =
                upsetNote(point.winProb, outcome) ?? closeCallNote(game, point.teamId ?? undefined);

              const cls = [
                isPast ? "ledger-past" : "",
                isNow ? "ledger-now" : "",
                edited.has(w) ? "ledger-edited" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={w} className={cls || undefined}>
                  <th scope="row" className="num">
                    {isNow ? <span className="dot now-dot" aria-hidden="true" /> : null}
                    {w}
                    {edited.has(w) ? (
                      <span className="pill scenario" style={{ marginLeft: 6 }}>
                        edited
                      </span>
                    ) : null}
                  </th>
                  <td>
                    {editing === w && !readOnly ? (
                      <select
                        className="control"
                        autoFocus
                        aria-label={`Change week ${w} pick`}
                        value={point.teamId ?? ""}
                        onChange={(e) => {
                          setPick(w, e.target.value || undefined);
                          setEditing(null);
                        }}
                        onBlur={() => setEditing(null)}
                      >
                        <option value="">No pick</option>
                        {[...(slots.get(w)?.keys() ?? [])]
                          .map((id) => teamsById.get(id))
                          .filter((t): t is NonNullable<typeof t> => !!t)
                          .sort((a, b) => (a.abbr ?? "").localeCompare(b.abbr ?? ""))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.abbr} — {t.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="flex items-center gap-2">
                        <TeamChipLabel
                          abbr={team?.abbr}
                          logo={team?.logo_url}
                          name={team?.name}
                          teamId={team?.id}
                        />
                        {readOnly ? null : (
                          <button
                            className="icon-btn"
                            onClick={() => setEditing(w)}
                            aria-label={`Edit week ${w} pick`}
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="sub">{opp ? `${slot?.isHome ? "vs" : "@"} ${opp.abbr}` : "—"}</td>
                  <td>
                    {outcome ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <ResultPill outcome={outcome} />
                        {mineScore != null && theirScore != null ? (
                          <span className="num">
                            {mineScore}–{theirScore}
                          </span>
                        ) : null}
                        {note ? <span className="sub result-note">{note}</span> : null}
                      </span>
                    ) : isNow && state !== "pre" ? (
                      <span className="flex items-center gap-2">
                        <GamePill state={state} detail={game?.status_detail} />
                        {kickedOff ? <span className="sub">kicked off</span> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={isPast ? "muted-cell" : undefined}>
                    <WinPill p={point.winProb} />
                  </td>
                  <td className="num">
                    {curve.slice(0, i + 1).some((p) => p.winProb != null)
                      ? pct(point.cumulative, 2)
                      : "—"}
                  </td>
                  <td>
                    {originalLocked ? (
                      <Delta pp={ppDelta(point.cumulative, orig.cumulative)} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
