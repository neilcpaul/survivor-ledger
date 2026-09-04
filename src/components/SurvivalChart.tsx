import { useMemo } from "react";
import type { CurvePoint } from "@/lib/survivor";
import { pct } from "@/lib/survivor";

type Series = { key: string; label: string; color: string; curve: CurvePoint[]; dashed?: boolean };

const W = 720;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 30, left: 46 };

export function SurvivalChart({
  series,
  band,
  currentWeek,
}: {
  series: Series[];
  band?: CurvePoint[];
  currentWeek?: number;
}) {
  const { min } = useMemo(() => {
    let lo = 1;
    for (const s of series) for (const p of s.curve) lo = Math.min(lo, p.cumulative);
    if (band) for (const p of band) lo = Math.min(lo, Math.max(1e-4, p.cumulative - p.sd));
    return { min: Math.max(1e-4, lo * 0.7) };
  }, [series, band]);

  const x = (week: number) =>
    PAD.left + ((week - 1) / 17) * (W - PAD.left - PAD.right);
  const y = (v: number) => {
    const clamped = Math.max(min, Math.min(1, v));
    const t = Math.log(clamped / min) / Math.log(1 / min);
    return PAD.top + (1 - t) * (H - PAD.top - PAD.bottom);
  };

  const ticks = [1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001].filter((t) => t >= min);

  const path = (curve: CurvePoint[]) =>
    curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.week).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(" ");

  const bandPath = band
    ? [
        ...band.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.week).toFixed(1)},${y(p.cumulative + p.sd).toFixed(1)}`),
        ...[...band].reverse().map((p) => `L${x(p.week).toFixed(1)},${y(Math.max(min, p.cumulative - p.sd)).toFixed(1)}`),
        "Z",
      ].join(" ")
    : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Season survival probability by week, log scale"
        style={{ display: "block" }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--ink-3)">
              {t >= 0.01 ? `${(t * 100).toFixed(0)}%` : `${(t * 100).toFixed(1)}%`}
            </text>
          </g>
        ))}
        {[1, 5, 9, 13, 18].map((w) => (
          <text key={w} x={x(w)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
            W{w}
          </text>
        ))}
        {currentWeek ? (
          <line
            x1={x(currentWeek)}
            x2={x(currentWeek)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--ink-3)"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
        ) : null}

        {bandPath ? <path d={bandPath} fill="var(--accent)" opacity={0.13} /> : null}

        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.curve)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.6 : 2.2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10 }}>
        {series.map((s) => (
          <span key={s.key} className="badge">
            <span
              className="dot"
              style={{ background: s.color, borderRadius: s.dashed ? 0 : 999 }}
              aria-hidden="true"
            />
            {s.label} · {pct(s.curve[s.curve.length - 1]?.cumulative ?? 0, 2)}
          </span>
        ))}
        {band ? <span className="sub">Shaded band = ±1σ uncertainty</span> : null}
      </div>
    </div>
  );
}
