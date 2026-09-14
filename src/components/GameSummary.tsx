import { useQuery } from "@tanstack/react-query";
import type { Game } from "@/lib/survivor";
import { useSurvivor } from "@/lib/survivor-store";

type SummaryPayload = {
  scoring: { text: string; period: number; clock: string; homeScore: number; awayScore: number }[];
  teamStats: {
    teamId: string | null;
    abbr: string | null;
    homeAway: string | null;
    stats: { label: string; display: string }[];
  }[];
  players: {
    teamId: string | null;
    abbr: string | null;
    categories: {
      name: string;
      labels: string[];
      athletes: {
        name: string | null;
        position: string | null;
        headshot: string | null;
        stats: string[];
      }[];
    }[];
  }[];
  leaders: {
    teamId: string | null;
    category: string;
    entries: { display: string; name: string | null; position: string | null; headshot: string | null }[];
  }[];
  attendance: number | null;
  officials: string[];
};

/**
 * Scoring, team stats and leaders for one game. The ESPN summary payload is
 * large, so it is only fetched when a row is expanded and then cached hard.
 */
export function GameSummary({ game }: { game: Game }) {
  const { teamsById } = useSurvivor();
  const played = !!game.status_completed || game.status_state === "in";

  const { data, isLoading } = useQuery({
    queryKey: ["game-summary", game.id],
    enabled: played,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<SummaryPayload | null> => {
      const res = await fetch(`/api/public/espn-summary?event=${game.id}`);
      if (!res.ok) return null;
      return (await res.json()) as SummaryPayload;
    },
  });

  const home = game.home_team_id ? teamsById.get(game.home_team_id) : undefined;
  const away = game.away_team_id ? teamsById.get(game.away_team_id) : undefined;
  const lines = game.home_linescores ?? [];

  if (!played) return null;

  return (
    <div className="summary-stack">
      {lines.length ? (
        <section>
          <h4>Scoring by quarter</h4>
          <div className="scroll-x">
            <table className="grid compact">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  {lines.map((l) => (
                    <th key={l.period} scope="col" className="num">
                      Q{l.period}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    T
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { t: away, ls: game.away_linescores ?? [], total: game.away_score },
                  { t: home, ls: game.home_linescores ?? [], total: game.home_score },
                ].map((row, i) => (
                  <tr key={i}>
                    <th scope="row">{row.t?.abbr ?? "—"}</th>
                    {row.ls.map((l) => (
                      <td key={l.period} className="num">
                        {l.display}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{row.total ?? "—"}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isLoading ? <p className="sub">Loading game detail…</p> : null}

      {data?.scoring?.length ? (
        <section>
          <h4>Scoring plays</h4>
          <ol className="scoring-timeline">
            {data.scoring.map((p, i) => (
              <li key={i}>
                <span className="sub num">
                  Q{p.period} {p.clock}
                </span>
                <span>{p.text}</span>
                <span className="num">
                  {away?.abbr} {p.awayScore} – {p.homeScore} {home?.abbr}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {data?.leaders?.some((l) => l.entries.length) ? (
        <section>
          <h4>Leaders</h4>
          <div className="flex flex-wrap gap-4">
            {data.leaders
              .filter((l) => l.entries.length)
              .map((l, i) => (
                <div key={i} className="leader-item">
                  <div className="sub">
                    {teamsById.get(l.teamId ?? "")?.abbr ?? ""} · {l.category}
                  </div>
                  <div>
                    <strong>{l.entries[0]!.name}</strong>{" "}
                    <span className="sub">{l.entries[0]!.position}</span>
                  </div>
                  <div className="sub num">{l.entries[0]!.display}</div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {data?.teamStats?.some((t) => t.stats.length) ? (
        <section>
          <h4>Team stats</h4>
          <div className="scroll-x">
            <table className="grid compact">
              <thead>
                <tr>
                  <th scope="col">Stat</th>
                  {data.teamStats.map((t) => (
                    <th key={t.teamId ?? t.abbr} scope="col" className="num">
                      {t.abbr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.teamStats[0]?.stats ?? []).map((s, i) => (
                  <tr key={s.label}>
                    <th scope="row">{s.label}</th>
                    {data.teamStats.map((t) => (
                      <td key={(t.teamId ?? "") + i} className="num">
                        {t.stats[i]?.display ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.attendance || data?.officials?.length ? (
        <p className="sub">
          {data.attendance ? `Attendance ${data.attendance.toLocaleString()}` : null}
          {data.attendance && data.officials.length ? " · " : null}
          {data.officials.length ? `Officials: ${data.officials.join(", ")}` : null}
        </p>
      ) : null}
    </div>
  );
}
