import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { WeekLedgerTable } from "@/components/WeekLedgerTable";
import {
  adminActivityFeed,
  adminDeleteEntry,
  adminGetEntryPicks,
  adminListUsers,
  adminRenameEntry,
  adminSetAccess,
  adminSetWelcomeWizard,
  type ActivityRow,
  type AdminEntryRow,
  type AdminUserRow,
} from "@/lib/access.functions";
import { useSurvivor } from "@/lib/survivor-store";
import { survivalCurve, type Plan } from "@/lib/survivor";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Survivor Ledger" },
      {
        name: "description",
        content: "Manage Survivor Ledger member access: feature tier and administrator rights.",
      },
      { property: "og:title", content: "Administration — Survivor Ledger" },
      { property: "og:description", content: "Manage member access for Survivor Ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function eventLabel(row: ActivityRow): string {
  const d = row.detail ?? {};
  const entry = row.target_entry_name ?? (d["name"] as string | undefined) ?? "entry";
  switch (row.event_type) {
    case "signup":
      return "Signed up";
    case "login":
      return "Signed in";
    case "tier_change":
      return `Changed tier: ${d["from"] ?? "—"} → ${d["to"] ?? "—"}`;
    case "admin_toggle":
      return d["to"] ? "Granted administrator rights" : "Removed administrator rights";
    case "entry_create":
      return `Created entry '${d["name"] ?? entry}'`;
    case "entry_rename":
      return `Renamed entry to '${d["to"] ?? entry}'`;
    case "entry_delete":
      return `Deleted entry '${entry}'`;
    case "pick_change":
      return `Changed Week ${d["week"]} pick: ${d["from"] ?? "—"} → ${d["to"] ?? "—"}`;
    case "original_plan_locked":
      return "Original plan locked";
    case "original_plan_reset":
      return "Original plan reset";
    case "strategy_applied":
      return `Applied strategy to ${d["count"] ?? "several"} week(s)`;
    case "setting_change":
      return `Changed setting '${d["setting"] ?? "—"}' to ${d["to"] === true ? "on" : d["to"] === false ? "off" : String(d["to"] ?? "—")}`;
    default:
      return row.event_type;
  }
}

function AdminPage() {
  const { isAdmin, session, profileLoaded, welcomeWizardEnabled } = useSurvivor();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    if (session !== null && profileLoaded && !isAdmin) void navigate({ to: "/" });
  }, [isAdmin, session, profileLoaded, navigate]);

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => adminListUsers(),
  });

  const activityQ = useQuery({
    queryKey: ["admin-activity", limit],
    enabled: isAdmin,
    queryFn: () => adminActivityFeed({ data: { limit } }),
  });

  const mutate = useMutation({
    mutationFn: (input: { userId: string; tier?: "basic" | "analysis"; isAdmin?: boolean }) =>
      adminSetAccess({ data: input }),
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-activity"] });
    },
  });
  const wizardToggle = useMutation({
    mutationFn: (enabled: boolean) => adminSetWelcomeWizard({ data: { enabled } }),
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["site-settings"] });
      void qc.invalidateQueries({ queryKey: ["admin-activity"] });
    },
  });


  if (!isAdmin) {
    return (
      <AppShell title="Administration">
        <Empty>{profileLoaded ? "Redirecting…" : "Loading…"}</Empty>
      </AppShell>
    );
  }

  const rows = (usersQ.data ?? []) as AdminUserRow[];
  const activity = (activityQ.data ?? []) as ActivityRow[];

  const toggleUser = (id: string) =>
    setOpenUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AppShell title="Administration">
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Site settings</h2>
            <p className="sub">Options that affect every visitor.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span>Show welcome wizard to new visitors</span>
          <button
            className={`btn${welcomeWizardEnabled ? " primary" : ""}`}
            aria-pressed={welcomeWizardEnabled}
            disabled={wizardToggle.isPending}
            onClick={() => wizardToggle.mutate(!welcomeWizardEnabled)}
          >
            {welcomeWizardEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Members</h2>
            <p className="sub">Feature access, administrator rights, and entries for every account.</p>
          </div>
        </div>
        {error ? <p className="pill critical">{error}</p> : null}
        {usersQ.isLoading ? (
          <Empty>Loading members…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No members yet.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 36 }}>
                    <span className="sr-only">Expand</span>
                  </th>
                  <th scope="col">Email</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Access</th>
                  <th scope="col">Administrator</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <UserRows
                    key={u.id}
                    user={u}
                    open={openUsers.has(u.id)}
                    onToggle={() => toggleUser(u.id)}
                    confirmRevoke={confirmRevoke}
                    setConfirmRevoke={setConfirmRevoke}
                    onSetAccess={(input) => mutate.mutate(input)}
                    onError={setError}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>Activity</h2>
            <p className="sub">Newest first — member actions, admin changes, and sign-ins.</p>
          </div>
        </div>
        {activityQ.isLoading ? (
          <Empty>Loading activity…</Empty>
        ) : activity.length === 0 ? (
          <Empty>No activity recorded yet.</Empty>
        ) : (
          <>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Event</th>
                    <th scope="col">Affected</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <th scope="row" className="sub num">
                        {new Date(a.created_at).toLocaleString()}
                      </th>
                      <td className="truncate">
                        {a.actor_type === "admin" ? "Admin · " : ""}
                        {a.actor_email ?? "—"}
                      </td>
                      <td>{eventLabel(a)}</td>
                      <td className="sub truncate">
                        {[a.target_user_email, a.target_entry_name].filter(Boolean).join(" · ") ||
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activity.length >= limit ? (
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setLimit((l) => l + 200)}>
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

function UserRows({
  user,
  open,
  onToggle,
  confirmRevoke,
  setConfirmRevoke,
  onSetAccess,
  onError,
}: {
  user: AdminUserRow;
  open: boolean;
  onToggle: () => void;
  confirmRevoke: string | null;
  setConfirmRevoke: (v: string | null) => void;
  onSetAccess: (input: { userId: string; tier?: "basic" | "analysis"; isAdmin?: boolean }) => void;
  onError: (v: string | null) => void;
}) {
  const label = user.email ?? user.id;
  return (
    <>
      <tr>
        <td>
          <button
            className="btn"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} entries for ${label}`}
            onClick={onToggle}
          >
            {open ? "▾" : "▸"}
          </button>
        </td>
        <th scope="row" className="truncate">
          {label}
        </th>
        <td className="sub num">
          {new Date(user.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </td>
        <td>
          <select
            className="control"
            aria-label={`Access level for ${label}`}
            value={user.tier}
            onChange={(e) =>
              onSetAccess({ userId: user.id, tier: e.target.value as "basic" | "analysis" })
            }
          >
            <option value="basic">Basic</option>
            <option value="analysis">Analysis</option>
          </select>
        </td>
        <td>
          {confirmRevoke === user.id ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="sub">Remove admin rights?</span>
              <button
                className="btn"
                style={{ color: "var(--critical)", borderColor: "var(--critical)" }}
                onClick={() => {
                  onSetAccess({ userId: user.id, isAdmin: false });
                  setConfirmRevoke(null);
                }}
              >
                Confirm
              </button>
              <button className="btn" onClick={() => setConfirmRevoke(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              className={`btn${user.is_admin ? " primary" : ""}`}
              aria-pressed={user.is_admin}
              onClick={() =>
                user.is_admin
                  ? setConfirmRevoke(user.id)
                  : onSetAccess({ userId: user.id, isAdmin: true })
              }
            >
              {user.is_admin ? "Admin" : "Not admin"}
            </button>
          )}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5}>
            {user.entries.length === 0 ? (
              <Empty>No entries for this member.</Empty>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {user.entries.map((e) => (
                  <EntryBlock
                    key={e.id}
                    entry={e}
                    user={user}
                    onlyEntry={user.entries.length === 1}
                    onError={onError}
                  />
                ))}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EntryBlock({
  entry,
  user,
  onlyEntry,
  onError,
}: {
  entry: AdminEntryRow;
  user: AdminUserRow;
  onlyEntry: boolean;
  onError: (v: string | null) => void;
}) {
  const qc = useQueryClient();
  const { slots } = useSurvivor();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const picksQ = useQuery({
    queryKey: ["admin-entry-picks", entry.id],
    enabled: open,
    queryFn: () => adminGetEntryPicks({ data: { entryId: entry.id } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-activity"] });
  };

  const rename = useMutation({
    mutationFn: (name: string) => adminRenameEntry({ data: { entryId: entry.id, name } }),
    onError: (e: Error) => onError(e.message),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => adminDeleteEntry({ data: { entryId: entry.id } }),
    onError: (e: Error) => onError(e.message),
    onSuccess: refresh,
  });

  const curves = useMemo(() => {
    const picks = (picksQ.data?.picks ?? {}) as Plan;
    const original = (picksQ.data?.originalPicks ?? {}) as Plan;
    return {
      mine: survivalCurve(slots, picks),
      original: survivalCurve(slots, original),
    };
  }, [picksQ.data, slots]);

  const commitRename = () => {
    const clean = draft.trim();
    setRenaming(false);
    if (clean && clean !== entry.name) rename.mutate(clean);
    else setDraft(entry.name);
  };

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="btn"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} picks for ${entry.name}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"}
        </button>
        {renaming ? (
          <input
            className="control"
            autoFocus
            value={draft}
            aria-label={`Rename ${entry.name}`}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={commitRename}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") commitRename();
              if (ev.key === "Escape") {
                setDraft(entry.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <strong className="truncate">{entry.name}</strong>
        )}
        <span className="sub num">
          {new Date(entry.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
        <span className="sub num">{entry.weeks_filled}/18 weeks picked</span>
        <span style={{ marginLeft: "auto" }} className="flex items-center gap-2 flex-wrap">
          {confirmDelete ? (
            <>
              <span className="sub">
                {onlyEntry
                  ? `This is ${user.email ?? "this member"}'s only entry — deleting it removes all their picks, and they won't be able to recover them.`
                  : `Delete '${entry.name}'? This removes all its picks.`}
              </span>
              <button
                className="btn"
                style={{ color: "var(--critical)", borderColor: "var(--critical)" }}
                onClick={() => {
                  remove.mutate();
                  setConfirmDelete(false);
                }}
              >
                Confirm
              </button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="btn"
                aria-label={`Rename ${entry.name}`}
                onClick={() => {
                  setDraft(entry.name);
                  setRenaming(true);
                }}
              >
                ✎
              </button>
              <button
                className="btn"
                aria-label={`Delete ${entry.name}`}
                onClick={() => setConfirmDelete(true)}
              >
                🗑
              </button>
            </>
          )}
        </span>
      </div>

      {open ? (
        picksQ.isLoading ? (
          <Empty>Loading picks…</Empty>
        ) : (
          <div style={{ marginTop: 10 }}>
            <WeekLedgerTable
              curve={curves.mine}
              originalCurve={curves.original}
              originalLocked={picksQ.data?.originalLocked ?? false}
            />
          </div>
        )
      ) : null}
    </div>
  );
}
