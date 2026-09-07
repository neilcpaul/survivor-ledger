import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { buildSlots, optimalPlan, type Game, type Plan } from "./survivor";

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  display_name: string | null;
  tier: "basic" | "analysis";
  is_admin: boolean;
  entries: AdminEntryRow[];
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/**
 * The Kuhn–Munkres optimal plan is analysis-tier only. A basic-tier session
 * never receives the solver's output — the check happens here, server side,
 * not just in the UI.
 *
 * An optional per-week `weights` array (18 entries, index 0 = week 1) scales
 * each week's -log(p) cost before the same solver runs. Omitted or all-1.0
 * reproduces today's maximum-survival behaviour exactly.
 */
export const getOptimalPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { weights?: number[] } | undefined) => {
    const weights = input?.weights;
    if (weights === undefined) return { weights: undefined };
    if (!Array.isArray(weights) || weights.length !== 18) {
      throw new Error("weights must be an array of 18 numbers");
    }
    return {
      weights: weights.map((w) => {
        const n = Number(w);
        if (!Number.isFinite(n) || n <= 0 || n > 10) throw new Error("Invalid weight");
        return n;
      }),
    };
  })
  .handler(async ({ context, data }): Promise<{ tier: string; plan: Plan | null }> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("tier")
      .eq("id", context.userId)
      .maybeSingle();
    const tier = profile?.tier ?? "basic";
    if (tier !== "analysis") return { tier, plan: null };

    const db = publicClient();
    const [{ data: games }, { data: teams }] = await Promise.all([
      db
        .from("games")
        .select(
          "id, week, home_team_id, away_team_id, kickoff_at, venue_name, venue_city, venue_state, venue_indoor, broadcast, weather_condition, weather_temp_f, home_win_prob, away_win_prob, updated_at",
        )
        .eq("season_type", 2),
      db.from("teams").select("id"),
    ]);
    const slots = buildSlots((games ?? []) as Game[]);
    const plan = optimalPlan(
      slots,
      (teams ?? []).map((t) => t.id),
      data?.weights,
    );
    return { tier, plan };
  });


/**
 * Verified server-side with the service role: the caller's identity comes from
 * the validated bearer token, and no client role can reach this check directly.
 */
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (data?.is_admin !== true) throw new Error("Forbidden");
}

/** One row in the unified activity feed (activity_log + auth sign-ins). */
export type ActivityDetail = Record<string, string | number | boolean | null>;

export type ActivityRow = {
  id: string;
  created_at: string;
  actor_type: "user" | "admin" | "system";
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  target_user_id: string | null;
  target_user_email: string | null;
  target_entry_id: string | null;
  target_entry_name: string | null;
  detail: ActivityDetail;
};

export type AdminEntryRow = {
  id: string;
  name: string;
  created_at: string;
  weeks_filled: number;
};

async function writeActivity(row: {
  actor_type: "user" | "admin" | "system";
  actor_id: string | null;
  event_type: string;
  target_user_id?: string | null;
  target_entry_id?: string | null;
  detail?: ActivityDetail;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activity_log").insert({
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    event_type: row.event_type,
    target_user_id: row.target_user_id ?? null,
    target_entry_id: row.target_entry_id ?? null,
    detail: (row.detail ?? {}) as never,
  });
}

/**
 * A signed-in user recording their own activity. The actor is always taken
 * from the validated bearer token, never from the request body.
 */
export const logUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { eventType: string; entryId?: string | null; detail?: ActivityDetail }) => {
      if (!input?.eventType) throw new Error("eventType is required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await writeActivity({
      actor_type: "user",
      actor_id: context.userId,
      event_type: data.eventType,
      target_user_id: context.userId,
      target_entry_id: data.entryId ?? null,
      detail: data.detail ?? {},
    });
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const [{ data: profiles }, { data: entries }, { data: picks }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, tier, is_admin"),
      supabaseAdmin.from("entries").select("id, user_id, name, created_at"),
      supabaseAdmin.from("picks").select("entry_id, team_id"),
    ]);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const filled = new Map<string, number>();
    for (const p of picks ?? []) {
      if (!p.team_id) continue;
      filled.set(p.entry_id, (filled.get(p.entry_id) ?? 0) + 1);
    }
    const entriesByUser = new Map<string, AdminEntryRow[]>();
    for (const e of entries ?? []) {
      const list = entriesByUser.get(e.user_id) ?? [];
      list.push({
        id: e.id,
        name: e.name,
        created_at: e.created_at,
        weeks_filled: Math.min(18, filled.get(e.id) ?? 0),
      });
      entriesByUser.set(e.user_id, list);
    }
    return users.users.map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        display_name: p?.display_name ?? null,
        tier: (p?.tier as "basic" | "analysis") ?? "basic",
        is_admin: p?.is_admin ?? false,
        entries: (entriesByUser.get(u.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      };
    });
  });

/**
 * One entry's stored team selections plus its locked baseline. Probabilities
 * are never returned frozen — the caller re-derives them from today's synced
 * odds, exactly as the entry's owner sees on their own Week Ledger.
 */
export const adminGetEntryPicks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string }) => {
    if (!input?.entryId) throw new Error("entryId is required");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      picks: Record<number, string>;
      originalPicks: Record<number, string>;
      originalLocked: boolean;
    }> => {
      await assertAdmin(context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: entry }, { data: rows }] = await Promise.all([
        supabaseAdmin
          .from("entries")
          .select("original_picks, original_locked_at")
          .eq("id", data.entryId)
          .maybeSingle(),
        supabaseAdmin.from("picks").select("week, team_id").eq("entry_id", data.entryId),
      ]);
      const picks: Record<number, string> = {};
      for (const r of rows ?? []) if (r.team_id) picks[r.week] = r.team_id;
      const originalPicks: Record<number, string> = {};
      const raw = entry?.original_picks;
      if (raw && typeof raw === "object") {
        for (const [w, t] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof t === "string") originalPicks[Number(w)] = t;
        }
      }
      return { picks, originalPicks, originalLocked: !!entry?.original_locked_at };
    },
  );

export const adminRenameEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string; name: string }) => {
    if (!input?.entryId || !input.name?.trim()) throw new Error("entryId and name are required");
    return { entryId: input.entryId, name: input.name.trim().slice(0, 120) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("entries")
      .select("name, user_id")
      .eq("id", data.entryId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("entries")
      .update({ name: data.name })
      .eq("id", data.entryId);
    if (error) throw error;
    await writeActivity({
      actor_type: "admin",
      actor_id: context.userId,
      event_type: "entry_rename",
      target_user_id: before?.user_id ?? null,
      target_entry_id: data.entryId,
      detail: { from: before?.name ?? null, to: data.name },
    });
    return { ok: true };
  });

/**
 * Unlike the self-service delete, an admin may remove a user's only entry —
 * the app already handles the zero-entries state for that user.
 */
export const adminDeleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryId: string }) => {
    if (!input?.entryId) throw new Error("entryId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("entries")
      .select("name, user_id")
      .eq("id", data.entryId)
      .maybeSingle();
    await supabaseAdmin.from("picks").delete().eq("entry_id", data.entryId);
    const { error } = await supabaseAdmin.from("entries").delete().eq("id", data.entryId);
    if (error) throw error;
    await writeActivity({
      actor_type: "admin",
      actor_id: context.userId,
      event_type: "entry_delete",
      target_user_id: before?.user_id ?? null,
      target_entry_id: data.entryId,
      detail: { name: before?.name ?? null },
    });
    return { ok: true };
  });

export const adminSetAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; tier?: "basic" | "analysis"; isAdmin?: boolean }) => {
    if (!input?.userId) throw new Error("userId is required");
    if (input.tier && input.tier !== "basic" && input.tier !== "analysis") {
      throw new Error("Invalid tier");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.isAdmin === false) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_admin", true);
      if ((count ?? 0) <= 1) throw new Error("There must always be at least one administrator");
    }

    const patch: { tier?: string; is_admin?: boolean } = {};
    if (data.tier) patch.tier = data.tier;
    if (typeof data.isAdmin === "boolean") patch.is_admin = data.isAdmin;
    if (!Object.keys(patch).length) return { ok: true };

    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("tier, is_admin")
      .eq("id", data.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw error;

    if (data.tier) {
      await writeActivity({
        actor_type: "admin",
        actor_id: context.userId,
        event_type: "tier_change",
        target_user_id: data.userId,
        detail: { from: before?.tier ?? null, to: data.tier },
      });
    }
    if (typeof data.isAdmin === "boolean") {
      await writeActivity({
        actor_type: "admin",
        actor_id: context.userId,
        event_type: "admin_toggle",
        target_user_id: data.userId,
        detail: { from: before?.is_admin ?? null, to: data.isAdmin },
      });
    }
    return { ok: true };
  });

/**
 * The unified feed: activity_log merged with Supabase Auth's own sign-in
 * records, newest first. Logins are never duplicated into activity_log.
 */
export const adminActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => {
    const n = Number(input?.limit ?? 200);
    return { limit: Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 1000) : 200 };
  })
  .handler(async ({ data, context }): Promise<ActivityRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: logRows }, logins, { data: users }, { data: entries }] = await Promise.all([
      supabaseAdmin
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit),
      supabaseAdmin.rpc("admin_recent_logins", { _limit: data.limit }),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("entries").select("id, name"),
    ]);

    const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));
    const entryNameById = new Map((entries ?? []).map((e) => [e.id, e.name]));

    const fromLog: ActivityRow[] = (logRows ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      actor_type: r.actor_type as ActivityRow["actor_type"],
      actor_id: r.actor_id,
      actor_email: r.actor_id ? (emailById.get(r.actor_id) ?? null) : null,
      event_type: r.event_type,
      target_user_id: r.target_user_id,
      target_user_email: r.target_user_id ? (emailById.get(r.target_user_id) ?? null) : null,
      target_entry_id: r.target_entry_id,
      target_entry_name: r.target_entry_id
        ? (entryNameById.get(r.target_entry_id) ??
          ((r.detail as ActivityDetail | null)?.["name"] as string | undefined) ??
          null)
        : null,
      detail: (r.detail as ActivityDetail) ?? {},
    }));

    const loginRows = (logins.data ?? []) as {
      id: string;
      user_id: string | null;
      created_at: string;
    }[];
    const fromAuth: ActivityRow[] = loginRows.map((r) => ({
      id: `login-${r.id}`,
      created_at: r.created_at,
      actor_type: "user",
      actor_id: r.user_id,
      actor_email: r.user_id ? (emailById.get(r.user_id) ?? null) : null,
      event_type: "login",
      target_user_id: r.user_id,
      target_user_email: r.user_id ? (emailById.get(r.user_id) ?? null) : null,
      target_entry_id: null,
      target_entry_name: null,
      detail: {},
    }));

    return [...fromLog, ...fromAuth]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, data.limit);
  });


/**
 * The welcome-wizard kill switch. Reading is public (the flag is a plain
 * boolean the anonymous landing page needs); writing is admin-only through the
 * service role, and is recorded in the activity log like every other admin act.
 */
export const adminSetWelcomeWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => {
    if (typeof input?.enabled !== "boolean") throw new Error("enabled is required");
    return { enabled: input.enabled };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(
        { id: "global", welcome_wizard_enabled: data.enabled, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) throw error;
    await writeActivity({
      actor_type: "admin",
      actor_id: context.userId,
      event_type: "setting_change",
      detail: { setting: "welcome_wizard_enabled", to: data.enabled },
    });
    return { ok: true };
  });


/**
 * Remove an account outright: its picks, entries, profile, and the auth user.
 * Admin-only, never self-deletion, and never the last remaining administrator.
 */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("userId is required");
    return { userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot remove your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, display_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.is_admin) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_admin", true);
      if ((count ?? 0) <= 1) throw new Error("There must always be at least one administrator");
    }

    const { data: entries } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("user_id", data.userId);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length) {
      await supabaseAdmin.from("picks").delete().in("entry_id", entryIds);
      await supabaseAdmin.from("entries").delete().eq("user_id", data.userId);
    }
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    // Logged before the auth record disappears so the feed keeps the email.
    await writeActivity({
      actor_type: "admin",
      actor_id: context.userId,
      event_type: "user_delete",
      target_user_id: data.userId,
      detail: {
        display_name: target?.display_name ?? null,
        entries_removed: entryIds.length,
      },
    });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });
