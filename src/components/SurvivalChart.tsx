import { useMemo, useRef, useState } from "react";
import type { CurvePoint } from "@/lib/survivor";
import { pct } from "@/lib/survivor";

type Series = {
  key: string;
  label: string;
  color: string;
  curve: CurvePoint[];
  dashed?: boolean;
  /** Draw weeks before the season clock as the realised (solid) path and the
   *  rest as a lighter forecast. */
  split?: boolean;
};

type Settled = CurvePoint & { settled?: boolean; outcome?: "won" | "lost" | "tied" | null };

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
  // Legend items toggle their own line off, so a chart with several entries
  // can be decluttered. Everything starts visible.
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const visible = series.filter((s) => !hidden[s.key]);

  const { min } = useMemo(() => {
    let lo = 1;
    for (const s of visible) for (const p of s.curve) lo = Math.min(lo, p.cumulative);
    if (band) for (const p of band) lo = Math.min(lo, Math.max(1e-4, p.cumulative - p.sd));
    return { min: Math.max(1e-4, lo * 0.7) };
  }, [visible, band]);

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

  // Uncertainty only applies to what hasn't happened yet.
  const bandPts = currentWeek ? (band ?? []).filter((p) => p.week >= currentWeek) : band;
  const bandPath = bandPts && bandPts.length > 1 ? buildBand(bandPts) : null;
  function buildBand(pts: CurvePoint[]) {
    return [
      ...pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.week).toFixed(1)},${y(p.cumulative + p.sd).toFixed(1)}`),
      ...[...pts].reverse().map((p) => `L${x(p.week).toFixed(1)},${y(Math.max(min, p.cumulative - p.sd)).toFixed(1)}`),
      "Z",
    ].join(" ");
  }

  /** Map a pointer position onto the nearest week on the axis. */
  const weekAt = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return null;
    const vx = ((clientX - rect.left) / rect.width) * W;
    const inner = W - PAD.left - PAD.right;
    const raw = ((vx - PAD.left) / inner) * 17 + 1;
    return Math.min(18, Math.max(1, Math.round(raw)));
  };

  const tooltipLeftPct = hoverWeek ? (x(hoverWeek) / W) * 100 : 0;
  const flip = tooltipLeftPct > 60;

  return (
    <div>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Season survival probability by week, log scale"
          style={{ display: "block", touchAction: "pan-y" }}
          onPointerMove={(e) => setHoverWeek(weekAt(e.clientX))}
          onPointerDown={(e) => setHoverWeek(weekAt(e.clientX))}
          onPointerLeave={() => setHoverWeek(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--ink-faint)">
                {t >= 0.01 ? `${(t * 100).toFixed(0)}%` : `${(t * 100).toFixed(1)}%`}
              </text>
            </g>
          ))}
          {[1, 5, 9, 13, 18].map((w) => (
            <text key={w} x={x(w)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
              W{w}
            </text>
          ))}
          {currentWeek && currentWeek > 1 ? (
            <rect
              x={PAD.left}
              y={PAD.top}
              width={Math.max(0, x(currentWeek) - PAD.left)}
              height={H - PAD.top - PAD.bottom}
              fill="var(--ink)"
              opacity={0.045}
            />
          ) : null}
          {currentWeek ? (
            <text
              x={x(currentWeek) + 4}
              y={PAD.top + 10}
              fontSize={10}
              fill="var(--ink-faint)"
            >
              Now · Week {currentWeek}
            </text>
          ) : null}
          {currentWeek ? (
            <line
              x1={x(currentWeek)}
              x2={x(currentWeek)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--ink-faint)"
              strokeDasharray="3 4"
              strokeWidth={1}
            />
          ) : null}

          {bandPath ? <path d={bandPath} fill="var(--accent)" opacity={0.13} /> : null}

          {visible.map((s) => {
            if (s.split && currentWeek) {
              const settled = s.curve.filter((p) => p.week <= currentWeek);
              const ahead = s.curve.filter((p) => p.week >= currentWeek);
              const dead = (s.curve as Settled[]).find(
                (p) => p.outcome === "lost" || p.outcome === "tied",
              );
              return (
                <g key={s.key}>
                  {settled.length > 1 ? (
                    <path
                      d={path(dead ? settled.filter((p) => p.week <= dead.week) : settled)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2.4}
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {dead ? (
                    <g>
                      <circle cx={x(dead.week)} cy={y(min)} r={4} fill="var(--critical)" />
                      <line
                        x1={x(dead.week) - 5}
                        x2={x(dead.week) + 5}
                        y1={y(min)}
                        y2={y(min)}
                        stroke="var(--critical)"
                        strokeWidth={2}
                      />
                    </g>
                  ) : ahead.length > 1 ? (
                    <path
                      d={path(ahead)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.8}
                      strokeDasharray="5 4"
                      opacity={0.8}
                      strokeLinejoin="round"
                    />
                  ) : null}
                </g>
              );
            }
            return (
              <path
                key={s.key}
                d={path(s.curve)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.6 : 2.2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeLinejoin="round"
              />
            );
          })}

          {hoverWeek ? (
            <g pointerEvents="none">
              <line
                x1={x(hoverWeek)}
                x2={x(hoverWeek)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--ink)"
                strokeWidth={1}
                opacity={0.45}
              />
              {visible.map((s) => {
                const p = s.curve[hoverWeek - 1];
                if (!p) return null;
                return (
                  <circle
                    key={s.key}
                    cx={x(hoverWeek)}
                    cy={y(p.cumulative)}
                    r={3.2}
                    fill={s.color}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {hoverWeek ? (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              left: `${tooltipLeftPct}%`,
              transform: flip ? "translate(calc(-100% - 10px), 0)" : "translate(10px, 0)",
            }}
          >
            <div className="label">Week {hoverWeek}</div>
            {visible.map((s) => (
              <div key={s.key} className="chart-tooltip-row">
                <span className="dot" style={{ background: s.color }} aria-hidden="true" />
                <span className="chart-tooltip-label">{s.label}</span>
                <span className="num">
                  {(s.curve[hoverWeek - 1] as Settled | undefined)?.outcome
                    ? (s.curve[hoverWeek - 1] as Settled).outcome
                    : pct(s.curve[hoverWeek - 1]?.cumulative ?? 0, 2)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10 }}>
        {series.map((s) => {
          const off = !!hidden[s.key];
          return (
            <button
              key={s.key}
              type="button"
              className="badge legend-toggle"
              aria-pressed={!off}
              title={off ? `Show ${s.label}` : `Hide ${s.label}`}
              style={off ? { opacity: 0.45 } : undefined}
              onClick={() => setHidden((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
            >
              <span
                className="dot"
                style={{ background: s.color, borderRadius: s.dashed ? 0 : 999 }}
                aria-hidden="true"
              />
              {s.label} · {pct(s.curve[s.curve.length - 1]?.cumulative ?? 0, 2)}
            </button>
          );
        })}
        {bandPath ? <span className="sub">Shaded band = ±1σ uncertainty (forecast only)</span> : null}
      </div>
    </div>
  );
}
