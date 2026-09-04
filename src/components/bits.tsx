import type { ReactNode } from "react";
import { pct, tierOf } from "@/lib/survivor";

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "accent" | "optimal" | "scenario" | "ink";
}) {
  const color =
    tone === "accent"
      ? "var(--accent)"
      : tone === "optimal"
        ? "var(--optimal)"
        : tone === "scenario"
          ? "var(--scenario)"
          : "var(--ink)";
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="stat-value" style={{ color }}>
        {value}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function WinPill({ p }: { p: number | null | undefined }) {
  const tier = tierOf(p);
  const text = tier === "good" ? "Strong" : tier === "caution" ? "Coin-flip" : tier === "critical" ? "Risky" : "No game";
  return (
    <span className={`pill ${tier}`} title={text}>
      <span className="dot" style={{ background: "currentColor" }} aria-hidden="true" />
      {pct(p)}
      <span className="sr-label" style={{ position: "absolute", left: -9999 }}>
        {text}
      </span>
    </span>
  );
}

export function Delta({ pp, digits = 2 }: { pp: number; digits?: number }) {
  const flat = Math.abs(pp) < 0.005;
  const cls = flat ? "flat" : pp > 0 ? "up" : "down";
  const arrow = flat ? "•" : pp > 0 ? "▲" : "▼";
  return (
    <span className={`delta ${cls}`}>
      <span aria-hidden="true">{arrow}</span>
      {flat ? "0.00" : `${Math.abs(pp).toFixed(digits)}`}pp
      <span style={{ position: "absolute", left: -9999 }}>
        {flat ? "no change" : pp > 0 ? "better" : "worse"}
      </span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="label faint" style={{ padding: "26px 4px" }}>
      {children}
    </div>
  );
}

export function TeamChipLabel({
  abbr,
  logo,
  name,
}: {
  abbr: string | null | undefined;
  logo?: string | null | undefined;
  name?: string | null | undefined;
}) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      {logo ? (
        <img src={logo} alt="" width={18} height={18} style={{ flexShrink: 0 }} loading="lazy" />
      ) : null}
      <span className="num" style={{ fontWeight: 600 }}>
        {abbr ?? "—"}
      </span>
      {name ? <span className="sub truncate">{name}</span> : null}
    </span>
  );
}
