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

function RailNav({ pathname }: { pathname: string }) {
  const railRef = useRef<HTMLElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(NAV.length);
  const [open, setOpen] = useState(false);

  // Measure each nav item once from a hidden mirror list, then work out how
  // many fit beside the brand on the horizontal (narrow-screen) rail.
  useEffect(() => {
    function recalc() {
      const rail = railRef.current;
      const measure = measureRef.current;
      if (!rail || !measure) return;
      const horizontal = window.matchMedia("(max-width: 920px)").matches;
      if (!horizontal) {
        setVisibleCount(NAV.length);
        return;
      }
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth);
      const styles = getComputedStyle(rail);
      const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const BURGER = 46; // burger button + gap
      const GAP = 16; // rail gap between brand and list
      let available =
        rail.clientWidth - padding - (brandRef.current?.offsetWidth ?? 0) - GAP - BURGER;
      let fit = 0;
      for (const w of widths) {
        const next = w + (fit > 0 ? 4 : 0);
        if (available - next < 0) break;
        available -= next;
        fit += 1;
      }
      setVisibleCount(fit);
    }
    recalc();
    window.addEventListener("resize", recalc);
    const ro = new ResizeObserver(recalc);
    if (railRef.current) ro.observe(railRef.current);
    return () => {
      window.removeEventListener("resize", recalc);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
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

  const overflow = NAV.slice(visibleCount);
  const visible = NAV.slice(0, visibleCount);

  return (
    <nav className="rail" aria-label="Sections" ref={railRef}>
      {overflow.length ? (
        <div className="popover-wrap rail-menu" ref={menuRef}>
          <button
            className="btn burger"
            aria-label="More sections"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="burger-bars" aria-hidden="true" />
          </button>
          {open ? (
            <div className="popover rail-popover" role="menu" aria-label="More sections">
              <div className="label" style={{ marginBottom: 6 }}>
                Sections
              </div>
              {overflow.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  aria-selected={pathname === item.to}
                  className="nav-item"
                  onClick={() => setOpen(false)}
                >
                  <span className="nav-dot" aria-hidden="true" />
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="brand" ref={brandRef}>
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
        {visible.map((item) => (
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

      {/* hidden mirror used only to measure natural item widths */}
      <div className="nav-measure" aria-hidden="true" ref={measureRef}>
        {NAV.map((item) => (
          <span key={item.to} className="nav-item">
            <span className="nav-dot" />
            {item.label}
          </span>
        ))}
      </div>
    </nav>
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
