import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { adminListUsers, adminSetAccess, type AdminUserRow } from "@/lib/access.functions";
import { useSurvivor } from "@/lib/survivor-store";

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

function AdminPage() {
  const { isAdmin, session } = useSurvivor();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== null && !isAdmin) void navigate({ to: "/" });
  }, [isAdmin, session, navigate]);

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => adminListUsers(),
  });

  const mutate = useMutation({
    mutationFn: (input: { userId: string; tier?: "basic" | "analysis"; isAdmin?: boolean }) =>
      adminSetAccess({ data: input }),
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  if (!isAdmin) {
    return (
      <AppShell title="Administration">
        <Empty>Redirecting…</Empty>
      </AppShell>
    );
  }

  const rows = (usersQ.data ?? []) as AdminUserRow[];

  return (
    <AppShell title="Administration">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Members</h2>
            <p className="sub">Feature access and administrator rights for every account.</p>
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
                  <th scope="col">Email</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Access</th>
                  <th scope="col">Administrator</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" className="truncate">
                      {u.email ?? u.id}
                    </th>
                    <td className="sub num">
                      {new Date(u.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <select
                        className="control"
                        aria-label={`Access level for ${u.email ?? u.id}`}
                        value={u.tier}
                        onChange={(e) =>
                          mutate.mutate({
                            userId: u.id,
                            tier: e.target.value as "basic" | "analysis",
                          })
                        }
                      >
                        <option value="basic">Basic</option>
                        <option value="analysis">Analysis</option>
                      </select>
                    </td>
                    <td>
                      {confirmRevoke === u.id ? (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="sub">Remove admin rights?</span>
                          <button
                            className="btn"
                            style={{ color: "var(--critical)", borderColor: "var(--critical)" }}
                            onClick={() => {
                              mutate.mutate({ userId: u.id, isAdmin: false });
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
                          className={`btn${u.is_admin ? " primary" : ""}`}
                          aria-pressed={u.is_admin}
                          onClick={() =>
                            u.is_admin
                              ? setConfirmRevoke(u.id)
                              : mutate.mutate({ userId: u.id, isAdmin: true })
                          }
                        >
                          {u.is_admin ? "Admin" : "Not admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
