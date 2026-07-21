import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "@/lib/supabase-public.server";

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

// Public: which plugins are on. Drives header/admin nav injection and module
// route gating on the client. Anonymous access is intentional — public pages
// like /blog need it before sign-in.
export const listActiveModules = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicSupabase();
  const { data, error } = await (sb as any)
    .from("modules")
    .select("slug")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug);
});

export const adminListModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("modules")
      .select(
        "id,slug,kind,name,description,version,min_core_version,is_active,activated_at,config,module_bindings(binding_type,target)",
      )
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setModuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(64), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("modules")
      .update({
        is_active: data.active,
        activated_at: data.active ? new Date().toISOString() : null,
        activated_by: data.active ? context.userId : null,
      })
      .eq("slug", data.slug)
      .select("id,slug,is_active")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.active ? "module_activate" : "module_deactivate",
      target_table: "modules",
      target_id: row.id,
      detail: { slug: data.slug },
    });
    const { invalidateModuleSnapshot } = await import("@/lib/hooks/modules.server");
    invalidateModuleSnapshot();
    return row;
  });

export const updateModuleConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1).max(64), config: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("modules")
      .update({ config: data.config })
      .eq("slug", data.slug)
      .select("id,slug,config")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "module_config_update",
      target_table: "modules",
      target_id: row.id,
      detail: { slug: data.slug },
    });
    return row;
  });

// WP-style "Delete": the code stays in the bundle (it ships with the app), but
// the module is switched off and its stored settings are wiped. Module-owned
// tables are left untouched — dropping user data needs an explicit,
// per-module decision, not a generic button.
export const uninstallModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("modules")
      .update({ is_active: false, activated_at: null, activated_by: null, config: {} })
      .eq("slug", data.slug)
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "module_uninstall",
      target_table: "modules",
      target_id: row.id,
      detail: { slug: data.slug },
    });
    const { invalidateModuleSnapshot } = await import("@/lib/hooks/modules.server");
    invalidateModuleSnapshot();
    return row;
  });
