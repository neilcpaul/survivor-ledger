export const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
export const TOTAL_WEEKS = 18;

export type Team = {
  id: string;
  abbr: string | null;
  name: string | null;
  conference: string | null;
  division: string | null;
  logo_url: string | null;
};

export type Game = {
  id: string;
  week: number;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_indoor: boolean | null;
  broadcast: string | null;
  weather_condition: string | null;
  weather_temp_f: number | null;
  home_win_prob: number | null;
  away_win_prob: number | null;
  updated_at: string | null;
};

/** One "team plays this week" opportunity. */
export type Slot = {
  week: number;
  teamId: string;
  opponentId: string | null;
  isHome: boolean;
  winProb: number;
  gameId: string;
};

export type Plan = Record<number, string | undefined>;

/** Index every (week, team) opportunity from the games table. */
export function buildSlots(games: Game[]): Map<number, Map<string, Slot>> {
  const byWeek = new Map<number, Map<string, Slot>>();
  for (const g of games) {
    if (!g.home_team_id || !g.away_team_id) continue;
    const week = byWeek.get(g.week) ?? new Map<string, Slot>();
    byWeek.set(g.week, week);
    const hp = typeof g.home_win_prob === "number" ? Number(g.home_win_prob) : null;
    const ap = typeof g.away_win_prob === "number" ? Number(g.away_win_prob) : null;
    week.set(g.home_team_id, {
      week: g.week,
      teamId: g.home_team_id,
      opponentId: g.away_team_id,
      isHome: true,
      winProb: hp ?? (ap != null ? 1 - ap : 0.5),
      gameId: g.id,
    });
    week.set(g.away_team_id, {
      week: g.week,
      teamId: g.away_team_id,
      opponentId: g.home_team_id,
      isHome: false,
      winProb: ap ?? (hp != null ? 1 - hp : 0.5),
      gameId: g.id,
    });
  }
  return byWeek;
}

export function byeWeeks(slots: Map<number, Map<string, Slot>>, teamId: string): number[] {
  return WEEKS.filter((w) => !slots.get(w)?.has(teamId));
}

/** Teams selectable for `week`: playing that week, and not already used elsewhere. */
export function eligibleTeams(
  slots: Map<number, Map<string, Slot>>,
  plan: Plan,
  week: number,
): Slot[] {
  const usedElsewhere = new Set(
    Object.entries(plan)
      .filter(([w, t]) => Number(w) !== week && t)
      .map(([, t]) => t as string),
  );
  const weekSlots = slots.get(week);
  if (!weekSlots) return [];
  return [...weekSlots.values()]
    .filter((s) => !usedElsewhere.has(s.teamId))
    .sort((a, b) => b.winProb - a.winProb);
}

export type CurvePoint = {
  week: number;
  teamId: string | undefined;
  opponentId: string | null;
  winProb: number | null;
  cumulative: number;
  sd: number;
};

/** Running product of the picked team's win probability, plus a ±1σ band. */
export function survivalCurve(
  slots: Map<number, Map<string, Slot>>,
  plan: Plan,
): CurvePoint[] {
  let cumulative = 1;
  let varianceSum = 0;
  return WEEKS.map((week) => {
    const teamId = plan[week];
    const slot = teamId ? slots.get(week)?.get(teamId) : undefined;
    const p = slot?.winProb ?? null;
    if (p != null && p > 0) {
      cumulative *= p;
      varianceSum += (1 - p) / p;
    }
    return {
      week,
      teamId,
      opponentId: slot?.opponentId ?? null,
      winProb: p,
      cumulative,
      sd: cumulative * Math.sqrt(varianceSum) * 0.5,
    };
  });
}

export function finalOdds(curve: CurvePoint[]): number {
  return curve.length ? curve[curve.length - 1]!.cumulative : 1;
}

/* ------------------------------------------------------------------ */
/* Hungarian / Kuhn–Munkres assignment (weeks × teams, maximise Σ log p) */
/* ------------------------------------------------------------------ */

/**
 * Rectangular Hungarian algorithm (JV variant) minimising total cost.
 * cost[i][j] = cost of assigning row i to column j. rows <= cols required.
 * Returns assignment[i] = column index (or -1).
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0]!.length;
  const INF = Infinity;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j]! > 0) assignment[p[j]! - 1] = j - 1;
  }
  return assignment;
}

const BIG = 1000; // effective cost of "no game / unusable" cells

/** Optimal one-team-per-season plan maximising the season-long product. */
export function optimalPlan(
  slots: Map<number, Map<string, Slot>>,
  teamIds: string[],
): Plan {
  if (!teamIds.length) return {};
  const cost = WEEKS.map((week) =>
    teamIds.map((teamId) => {
      const s = slots.get(week)?.get(teamId);
      if (!s || s.winProb <= 0) return BIG;
      return -Math.log(s.winProb);
    }),
  );
  const assignment = hungarian(cost);
  const plan: Plan = {};
  assignment.forEach((col, row) => {
    if (col < 0) return;
    const week = WEEKS[row]!;
    const teamId = teamIds[col]!;
    if (slots.get(week)?.has(teamId)) plan[week] = teamId;
  });
  return plan;
}

/** A reasonable default "original plan": greedy highest win probability. */
export function greedyPlan(slots: Map<number, Map<string, Slot>>): Plan {
  const plan: Plan = {};
  const used = new Set<string>();
  const candidates: Slot[] = [];
  for (const week of WEEKS) {
    for (const s of slots.get(week)?.values() ?? []) candidates.push(s);
  }
  candidates.sort((a, b) => b.winProb - a.winProb);
  for (const s of candidates) {
    if (plan[s.week] || used.has(s.teamId)) continue;
    plan[s.week] = s.teamId;
    used.add(s.teamId);
  }
  return plan;
}

/* ------------------------------- format ------------------------------ */

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function oddsAsOneInN(v: number): string {
  if (!v || v <= 0) return "—";
  const n = 1 / v;
  if (n >= 1000) return `1 in ${Math.round(n).toLocaleString()}`;
  return `1 in ${n.toFixed(n < 10 ? 1 : 0)}`;
}

export function tierOf(p: number | null | undefined): "good" | "caution" | "critical" | "neutral" {
  if (p == null) return "neutral";
  if (p >= 0.65) return "good";
  if (p >= 0.5) return "caution";
  return "critical";
}

/** Interpolate the single-hue sequential ramp between --seq-low and --seq-high. */
export function seqColor(p: number | null | undefined): string {
  if (p == null) return "var(--surface-2)";
  const t = Math.min(1, Math.max(0, p));
  return `color-mix(in srgb, var(--seq-high) ${(t * 100).toFixed(0)}%, var(--seq-low))`;
}

export function ppDelta(a: number, b: number): number {
  return (a - b) * 100;
}
