import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .in("role", ["admin", "superadmin"])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin only");
}

export const explainAdRank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: breakdown, error } = await supabaseAdmin.rpc("ad_rank_breakdown", { _ad_id: data.id });
    if (error) throw new Error(error.message);
    return breakdown as {
      ad_id: string; short_id: string; title: string; status: string;
      tier: string; age_days: number; views: number; reports: number; score: number;
      components: { label: string; value: number; explain: string }[];
    };
  });

async function assertAdminWithMfa(ctx: { supabase: any; userId: string; claims: any }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .in("role", ["admin", "superadmin"]);
  if (error) throw new Error(error.message);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!roles.has("admin") && !roles.has("superadmin")) {
    throw new Error("Forbidden: admin only");
  }
  if (roles.has("superadmin") && (ctx.claims?.aal ?? null) !== "aal2") {
    throw new Error("MFA_REQUIRED");
  }
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminWithMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Fail-fast schema validation: admin views embed profiles into ads,
    // invoices, audit_log, and payments. Probe each embed with a HEAD query;
    // on a stale PostgREST schema cache (PGRST200) ask for a reload and retry.
    const PROBES: Array<{ table: string; embed: string }> = [
      { table: "ads", embed: "id, profiles(display_name)" },
      { table: "invoices", embed: "id, profiles:user_id(display_name)" },
      { table: "audit_log", embed: "id, profiles:actor_id(display_name)" },
      { table: "payments", embed: "id, profiles:user_id(display_name)" },
    ];
    async function probe() {
      const results = await Promise.all(
        PROBES.map((p) =>
          supabaseAdmin.from(p.table as any).select(p.embed, { head: true, count: "exact" }).limit(1),
        ),
      );
      return results
        .map((r, i) => ({ table: PROBES[i].table, error: r.error }))
        .filter((r) => r.error);
    }
    let broken = await probe();
    if (broken.length) {
      try {
        await (supabaseAdmin as any).rpc("pgrst_reload_schema");
      } catch {
        /* function is optional; retry regardless */
      }
      broken = await probe();
      if (broken.length) {
        throw new Error(
          `Admin schema check failed: could not join ${broken
            .map((b) => `${b.table}→profiles`)
            .join(", ")}. ${broken[0].error?.message ?? ""}`.trim(),
        );
      }
    }
    const [users, ads, pending, live, topups, credits] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("ads").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("ads").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("ads").select("*", { count: "exact", head: true }).eq("status", "live"),
      supabaseAdmin.from("invoices").select("credit_cents").eq("status", "paid"),
      supabaseAdmin.from("user_credits").select("balance_cents"),
    ]);
    const topupTotal = (topups.data ?? []).reduce((s: number, r: any) => s + (r.credit_cents ?? 0), 0);
    const creditFloat = (credits.data ?? []).reduce((s: number, r: any) => s + (r.balance_cents ?? 0), 0);
    return {
      users: users.count ?? 0,
      ads: ads.count ?? 0,
      pending: pending.count ?? 0,
      live: live.count ?? 0,
      topups_cents: topupTotal,
      credit_float_cents: creditFloat,
    };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, display_name, is_banned, reputation, created_at, user_credits(balance_cents), user_roles(role)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.q) q = q.ilike("display_name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "moderator", "user"]),
        grant: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot revoke your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), banned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId && data.banned) {
      throw new Error("You cannot ban yourself.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_banned: data.banned })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        delta_cents: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
        reason: z.string().trim().min(2).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: newBalance, error } = await supabaseAdmin.rpc("admin_adjust_credits", {
      _target_user: data.user_id,
      _delta_cents: data.delta_cents,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true, balance_cents: newBalance };
  });

export const listAllAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pending", "live", "rejected", "expired", "removed", "draft"]).optional(),
        q: z.string().trim().max(120).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("ads")
      .select(
        "id, short_id, title, status, tier, price_cents, currency, created_at, expires_at, user_id, cities(name, states(code)), categories(name), profiles(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const removeAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ads")
      .update({ status: "removed", rejection_reason: data.reason ?? "Removed by admin" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("id, status, kind, credit_cents, price_amount, price_currency, pay_amount, pay_currency, created_at, user_id, profiles:user_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("feature_flags")
      .select("key, enabled, description, updated_at")
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("feature_flags")
      .update({ enabled: data.enabled, updated_by: context.userId })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, target_type, target_id, metadata, created_at, actor_id, profiles:actor_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Auto-takedown history — sourced from audit_log entries the scheduled
// moderation_auto_takedown job writes. Joins to ads for a display link
// even when the ad has been removed.
export const listAutoTakedowns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("audit_log")
      .select("id, created_at, target_id, detail, ads:target_id(id, short_id, title, status, rejection_reason)")
      .eq("action", "moderation_auto_takedown")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      created_at: string;
      target_id: string | null;
      detail: { short_id?: string; title?: string; open_reports?: number; threshold?: number; reason?: string } | null;
      ads: { id: string; short_id: string; title: string; status: string; rejection_reason: string | null } | null;
    }>;
  });

// Admin's own notification inbox (populated by moderation_auto_takedown and
// any future admin-facing event fan-outs). Read-only list + a mark-read mutation.
export const listAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from("admin_notifications")
      .select("id, kind, title, body, target_table, target_id, detail, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; kind: string; title: string; body: string | null;
      target_table: string | null; target_id: string | null;
      detail: Record<string, any> | null;
      read_at: string | null; created_at: string;
    }>;
  });

export const markAdminNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const nowIso = new Date().toISOString();
    let q = (context.supabase as any)
      .from("admin_notifications")
      .update({ read_at: nowIso })
      .is("read_at", null)
      .eq("user_id", context.userId);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });