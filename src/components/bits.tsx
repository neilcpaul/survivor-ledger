import type { MouseEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { pct, tierOf } from "@/lib/survivor";

export function StatCard({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "accent" | "optimal" | "scenario" | "ink";
  onClick?: (() => void) | undefined;
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
    <div
      className={`card${onClick ? " interactive" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
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
  teamId,
}: {
  abbr: string | null | undefined;
  logo?: string | null | undefined;
  name?: string | null | undefined;
  teamId?: string | null | undefined;
}) {
  const inner = (
    <>
      {logo ? (
        <img src={logo} alt="" width={18} height={18} style={{ flexShrink: 0 }} loading="lazy" />
      ) : null}
      <span className="num" style={{ fontWeight: 600 }}>
        {abbr ?? "—"}
      </span>
      {name ? <span className="sub truncate">{name}</span> : null}
    </>
  );

  if (teamId) {
    return (
      <Link
        to="/teams/$teamId"
        params={{ teamId }}
        className="team-link flex items-center gap-2 min-w-0"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        title={name ?? abbr ?? "Team page"}
      >
        {inner}
      </Link>
    );
  }

  return <span className="flex items-center gap-2 min-w-0">{inner}</span>;
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase();
  const tier = s.includes("out") || s.includes("injured reserve") || s.includes("suspend")
    ? "critical"
    : s.includes("doubtful") || s.includes("questionable")
      ? "caution"
      : s.includes("probable") || s.includes("active")
        ? "good"
        : "neutral";
  return (
    <span className={`pill ${tier}`}>
      <span className="dot" style={{ background: "currentColor" }} aria-hidden="true" />
      {status ?? "Unknown"}
    </span>
  );
}
