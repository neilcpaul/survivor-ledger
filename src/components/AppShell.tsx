import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

function EntrySwitcher() {
  const { entries, entryId, entryName, selectEntry, createEntry, renameEntry, deleteEntry } =
    useSurvivor();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setConfirmId(null);
      setAdding(false);
      setNewName("");
    }
  }, [open]);

  const only = entries.length <= 1;

  return (
    <div className="popover-wrap" ref={wrapRef}>
      <button
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {entryName ?? "No entry yet"}
        <span aria-hidden="true" style={{ marginLeft: 6 }}>
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover card" role="menu" aria-label="League entries">
          <div className="label" style={{ marginBottom: 8 }}>
            Your entries
          </div>

          {entries.length === 0 ? (
            <div className="sub" style={{ padding: "4px 0 8px" }}>
              No entries yet — create one to save your picks.
            </div>
          ) : null}

          {entries.map((entry) => {
            const active = entry.id === entryId;
            if (confirmId === entry.id) {
              return (
                <div key={entry.id} className="popover-row" style={{ flexWrap: "wrap" }}>
                  <span className="sub" style={{ flex: 1, minWidth: 0 }}>
                    Delete “{entry.name}”? This removes all its picks.
                  </span>
                  <button
                    className="btn"
                    style={{ color: "var(--critical)", borderColor: "var(--critical)" }}
                    onClick={() => {
                      void deleteEntry(entry.id);
                      setConfirmId(null);
                    }}
                  >
                    Confirm
                  </button>
                  <button className="btn" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <div key={entry.id} className="popover-row">
                {editingId === entry.id ? (
                  <input
                    className="control"
                    style={{ flex: 1, minWidth: 0 }}
                    autoFocus
                    value={editValue}
                    aria-label={`Rename ${entry.name}`}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      void renameEntry(entry.id, editValue);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void renameEntry(entry.id, editValue);
                        setEditingId(null);
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <>
                    <button
                      className="popover-name"
                      onClick={() => {
                        selectEntry(entry.id);
                        setOpen(false);
                      }}
                    >
                      <span
                        className="dot"
                        style={{ background: active ? "var(--accent)" : "transparent" }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{entry.name}</span>
                    </button>
                    <button
                      className="icon-btn"
                      title="Rename entry"
                      aria-label={`Rename ${entry.name}`}
                      onClick={() => {
                        setEditValue(entry.name);
                        setEditingId(entry.id);
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      className="icon-btn"
                      title={only ? "Can't delete your only entry" : "Delete entry"}
                      aria-label={
                        only ? "Can't delete your only entry" : `Delete ${entry.name}`
                      }
                      disabled={only}
                      onClick={() => setConfirmId(entry.id)}
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {only && entries.length === 1 ? (
            <div className="sub" style={{ padding: "2px 4px 6px" }}>
              Can't delete your only entry
            </div>
          ) : null}

          <div className="popover-sep" />

          {adding ? (
            <form
              className="popover-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void createEntry(newName);
                setNewName("");
                setAdding(false);
                setOpen(false);
              }}
            >
              <input
                className="control"
                style={{ flex: 1, minWidth: 0 }}
                autoFocus
                placeholder="Entry name, e.g. Office Pool"
                aria-label="New entry name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setAdding(false);
                  }
                }}
              />
              <button className="btn primary" type="submit" disabled={!newName.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button className="popover-name" onClick={() => setAdding(true)}>
              + New entry
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AuthWidget() {
  const { session, displayName, signOut, saveState, entryName } = useSurvivor();

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
                  : saveState === "no-entry"
                    ? "var(--neutral)"
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
              : saveState === "no-entry"
                ? "No entry — picks not saved"
                : "Loading entry…"}
      </span>

      <EntrySwitcher />
      <span className="sub">{displayName}</span>
      <button className="btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}


export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { currentWeek, lastSyncAt, refresh, refreshing, canRefresh, syncFailed, dataError } =
    useSurvivor();

  return (
    <div className="shell">
      <RailNav pathname={pathname} />


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
