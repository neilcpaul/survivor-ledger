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
 */
export const getOptimalPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tier: string; plan: Plan | null }> => {
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
    const plan = optimalPlan(slots, (teams ?? []).map((t) => t.id));
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

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, tier, is_admin");
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return users.users.map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        display_name: p?.display_name ?? null,
        tier: (p?.tier as "basic" | "analysis") ?? "basic",
        is_admin: p?.is_admin ?? false,
      };
    });
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

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw error;
    return { ok: true };
  });
