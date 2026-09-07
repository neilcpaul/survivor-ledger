import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { StatusPill, TeamChipLabel } from "@/components/bits";
import { supabase } from "@/integrations/supabase/client";
import { useSurvivor } from "@/lib/survivor-store";
import type { Team } from "@/lib/survivor";

const PRIMARY_POSITIONS = ["QB", "RB", "WR", "TE"];

export type Injury = {
  id: string;
  team_id: string | null;
  player_name: string | null;
  position: string | null;
  status: string | null;
  detail: string | null;
};

export type RosterPlayer = {
  id: string;
  team_id: string | null;
  name: string | null;
  position: string | null;
  jersey_number: string | null;
};

export function useTeamDetail(teamIds: string[], enabled: boolean) {
  const key = [...teamIds].sort().join(",");
  return useQuery({
    queryKey: ["team-detail", key],
    enabled: enabled && teamIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [inj, ros] = await Promise.all([
        supabase
          .from("injuries")
          .select("id, team_id, player_name, position, status, detail")
          .in("team_id", teamIds),
        supabase
          .from("roster_players")
          .select("id, team_id, name, position, jersey_number")
          .in("team_id", teamIds),
      ]);
      return {
        injuries: (inj.data ?? []) as Injury[],
        roster: (ros.data ?? []) as RosterPlayer[],
      };
    },
  });
}

export function TeamPanel({
  team,
  injuries,
  roster,
  linkTeam = true,
}: {
  team: Team | undefined;
  injuries: Injury[];
  roster: RosterPlayer[];
  linkTeam?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, RosterPlayer[]>();
    for (const p of roster) {
      const pos = p.position ?? "—";
      const list = map.get(pos) ?? [];
      list.push(p);
      map.set(pos, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }
    const primary = PRIMARY_POSITIONS.flatMap((position) => {
      const players = map.get(position);
      return players ? ([[position, players]] as const) : [];
    });
    const rest = [...map.entries()]
      .filter(([p]) => !PRIMARY_POSITIONS.includes(p))
      .sort((a, b) => a[0].localeCompare(b[0]));
    return [...primary, ...rest];
  }, [roster]);

  const statusByPlayer = useMemo(
    () =>
      new Map(
        injuries.map((injury) => [
          (injury.player_name ?? "").trim().toLocaleLowerCase(),
          injury.status,
        ]),
      ),
    [injuries],
  );

  return (
    <section className="fixture-team-panel">
      <header className="fixture-team-head">
        <TeamChipLabel
          abbr={team?.abbr}
          logo={team?.logo_url}
          name={team?.name}
          teamId={linkTeam ? team?.id : undefined}
        />
        <span className="sub num">{roster.length} players</span>
      </header>

      <div className="fixture-detail-section">
        <div className="fixture-section-head">
          <div className="label">Injuries · current status</div>
          <span className="sub num">{injuries.length}</span>
        </div>
        <div className="injury-list">
          {injuries.length === 0 ? (
            <span className="sub">No reported injuries.</span>
          ) : (
            injuries.map((i) => (
              <div key={i.id} className="injury-item">
                <span className="injury-position num">{i.position ?? "—"}</span>
                <span className="player-name" title={i.player_name ?? "Unknown"}>
                  {i.player_name ?? "Unknown"}
                </span>
                <span className="status-wrap">
                  <StatusPill status={i.status} />
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="fixture-detail-section">
        <div className="fixture-section-head">
          <div className="label">Full roster</div>
          <span className="sub">Position · No. · Player · Status</span>
        </div>
        <div className="roster-groups">
          {groups.map(([pos, players]) => (
            <div className="roster-group" key={pos}>
              <div className="roster-position num">{pos}</div>
              <div className="roster-player-list">
                {players.map((p) => (
                  <div key={p.id} className="roster-player">
                    <span className="num">{p.jersey_number ?? "—"}</span>
                    <span className="player-name" title={p.name ?? "Unknown"}>
                      {p.name ?? "Unknown"}
                    </span>
                    <span className="status-wrap">
                      <StatusPill
                        status={
                          statusByPlayer.get((p.name ?? "").trim().toLocaleLowerCase()) ?? "Active"
                        }
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Injuries + roster for one or two teams, stacked. */
export function TeamDetailStack({ teamIds }: { teamIds: (string | null)[] }) {
  const { teamsById } = useSurvivor();
  const ids = teamIds.filter((x): x is string => !!x);
  const { data, isLoading } = useTeamDetail(ids, true);

  if (isLoading) {
    return (
      <div className="label faint" style={{ padding: "26px 4px" }}>
        Loading injuries and rosters…
      </div>
    );
  }

  return (
    <div className="fixture-team-stack">
      {ids.map((id) => (
        <TeamPanel
          key={id}
          team={teamsById.get(id)}
          injuries={(data?.injuries ?? []).filter((i) => i.team_id === id)}
          roster={(data?.roster ?? []).filter((r) => r.team_id === id)}
        />
      ))}
    </div>
  );
}
