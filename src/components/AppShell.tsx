import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useSurvivor } from "@/lib/survivor-store";

const NAV = [
  { to: "/", label: "Season Overview" },
  { to: "/inventory", label: "Team Inventory" },
  { to: "/heatmap", label: "Matchup Heatmap" },
  { to: "/comparator", label: "Pick Comparator" },
  { to: "/fixtures", label: "Fixtures" },
] as const;

function agoLabel(iso: string | null): string {
  if (!iso) return "never synced";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AuthWidget() {
  const {
    session,
    displayName,
    entries,
    entryId,
    selectEntry,
    createEntry,
    signOut,
    saveState,
    entryName,
  } = useSurvivor();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="badge">
          <span className="dot" style={{ background: "var(--neutral)" }} aria-hidden="true" />
          Not saved · local to this device
        </span>
        <Link to="/auth" className="btn primary">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="badge" title={`Plan storage status: ${saveState}`}>
        <span
          className="dot"
          style={{
            background:
              saveState === "synced"
                ? "var(--accent)"
                : saveState === "error"
                  ? "var(--critical)"
                  : "var(--caution)",
          }}
          aria-hidden="true"
        />
        {saveState === "synced"
          ? `Synced to ${entryName ?? "entry"}`
          : saveState === "saving"
            ? "Saving…"
            : saveState === "error"
              ? "Save failed"
              : "Loading entry…"}
      </span>

      {creating ? (
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await createEntry(name.trim());
            setName("");
            setCreating(false);
          }}
        >
          <input
            className="control"
            placeholder="Office Pool"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            aria-label="New entry name"
          />
          <button className="btn primary" type="submit">
            Create
          </button>
          <button className="btn" type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <select
            className="control"
            aria-label="Select league entry"
            value={entryId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") setCreating(true);
              else selectEntry(e.target.value);
            }}
          >
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
            <option value="__new">+ New entry…</option>
          </select>
          <span className="sub">{displayName}</span>
          <button className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      )}
    </div>
  );
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { currentWeek, lastSyncAt, refresh, refreshing, canRefresh, syncFailed, dataError } =
    useSurvivor();

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            SL
          </span>
          <span className="brand-name">
            Survivor
            <br />
            Ledger
          </span>
        </div>
        <div className="nav-list" role="tablist" aria-orientation="vertical">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="tab"
              aria-selected={pathname === item.to}
              className="nav-item"
            >
              <span className="nav-dot" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h1 className="truncate">{title}</h1>
            <span className="badge">
              Week {currentWeek} of 18 · Regular season
            </span>
            {syncFailed || dataError ? (
              <span className="pill critical">Data may be stale</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <AuthWidget />
            <span className="badge" title={lastSyncAt ?? "no successful sync yet"}>
              <span
                className="dot"
                style={{ background: syncFailed ? "var(--caution)" : "var(--accent)" }}
                aria-hidden="true"
              />
              Synced {agoLabel(lastSyncAt)}
            </span>
            <button
              className="btn"
              onClick={() => void refresh()}
              disabled={!canRefresh}
              title={canRefresh ? "Fetch fresh data" : "Cached data is fresh (5 minute window)"}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>
        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
