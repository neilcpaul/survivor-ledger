import { useMemo } from "react";
import { ResultPill } from "@/components/bits";
import { useSurvivor } from "@/lib/survivor-store";
import { pct, pickOutcome, upsetNote, WEEKS, type Game } from "@/lib/survivor";

/**
 * A recap of the most recently completed week: how the user's own pick fared,
 * and how the week went generally (favourites' record and the biggest upset).
 * Renders nothing until at least one week is fully complete.
 */
export function WeekRecap() {
  const { games, teamsById, plan, gamesByWeekTeam } = useSurvivor();

  const recap = useMemo(() => {
    const byWeek = new Map<number, Game[]>();
    for (const g of games) {
      if (!byWeek.has(g.week)) byWeek.set(g.week, []);
      byWeek.get(g.week)!.push(g);
    }
    let week: number | null = null;
    for (const w of WEEKS) {
      const rows = byWeek.get(w);
      if (rows?.length && rows.every((g) => g.status_completed)) week = w;
    }
    if (week == null) return null;
    const rows = byWeek.get(week)!;

    let favourites = 0;
    let favouritesWon = 0;
    let upset: { g: Game; prob: number } | null = null;
    for (const g of rows) {
      const hp = g.home_win_prob;
      const ap = g.away_win_prob;
      if (hp == null || ap == null || !g.winner_team_id) continue;
      const favId = hp >= ap ? g.home_team_id : g.away_team_id;
      favourites++;
      if (favId === g.winner_team_id) favouritesWon++;
      const winnerProb = g.winner_team_id === g.home_team_id ? hp : ap;
      if (!upset || winnerProb < upset.prob) upset = { g, prob: winnerProb };
    }

    const teamId = plan[week];
    const myGame = teamId ? gamesByWeekTeam.get(`${week}:${teamId}`) : undefined;
    const outcome = pickOutcome(myGame, teamId);
    return { week, rows, favourites, favouritesWon, upset, teamId, myGame, outcome };
  }, [games, plan, gamesByWeekTeam]);

  if (!recap) return null;
  const { week, favourites, favouritesWon, upset, teamId, myGame, outcome } = recap;
  const abbr = (id: string | null | undefined) => (id ? (teamsById.get(id)?.abbr ?? "—") : "—");

  const mineScore =
    myGame && teamId ? (myGame.home_team_id === teamId ? myGame.home_score : myGame.away_score) : null;
  const theirScore =
    myGame && teamId ? (myGame.home_team_id === teamId ? myGame.away_score : myGame.home_score) : null;
  const oppId = myGame && teamId ? (myGame.home_team_id === teamId ? myGame.away_team_id : myGame.home_team_id) : null;
  const myProb =
    myGame && teamId
      ? myGame.home_team_id === teamId
        ? myGame.home_win_prob
        : myGame.away_win_prob
      : null;

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div>
          <h2>Week {week} recap</h2>
          <p className="sub">The last completed week, and how your pick did.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {outcome && myGame ? (
          <div>
            <div className="sub">Your pick</div>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{abbr(teamId)}</strong>
              <span className="sub">vs {abbr(oppId)}</span>
              <span className="num">
                {mineScore}–{theirScore}
              </span>
              <ResultPill outcome={outcome} />
              {upsetNote(myProb, outcome) ? (
                <span className="sub result-note">{upsetNote(myProb, outcome)}</span>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <div className="sub">Your pick</div>
            <div className="sub">No pick recorded for week {week}.</div>
          </div>
        )}
        <div>
          <div className="sub">Favourites</div>
          <div>
            <strong className="num">
              {favouritesWon}/{favourites}
            </strong>{" "}
            <span className="sub">pre-game favourites won</span>
          </div>
        </div>
        {upset ? (
          <div>
            <div className="sub">Biggest upset</div>
            <div>
              <strong>{abbr(upset.g.winner_team_id)}</strong>{" "}
              <span className="sub">
                beat{" "}
                {abbr(
                  upset.g.winner_team_id === upset.g.home_team_id
                    ? upset.g.away_team_id
                    : upset.g.home_team_id,
                )}{" "}
                at {pct(upset.prob)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
