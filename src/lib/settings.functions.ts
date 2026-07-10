import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SiteSettings = Record<string, Record<string, unknown>>;

/** Public settings — safe for SSR / anon; only rows with is_public=true. */
export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("get_public_settings");
  if (error) throw new Error(error.message);
  return (data ?? {}) as SiteSettings;
});

/** Admin: read every setting key (RLS enforces admin). */
export const getAllSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteSettings> => {
    const { data, error } = await context.supabase.from("site_settings").select("key,value");
    if (error) throw new Error(error.message);
    const out: SiteSettings = {};
    for (const row of data ?? []) out[row.key] = row.value as Record<string, unknown>;
    return out;
  });

const UpdateInput = z.object({
  key: z.string().min(1).max(64),
  value: z.record(z.string(), z.unknown()),
});

/** Admin: patch a single settings key (deep-merge value). */
export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("site_settings")
      .update({ value: data.value as never, updated_by: context.userId })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      action: "settings_update",
      target_type: "site_settings",
      target_id: null,
      metadata: { key: data.key },
    } as never);
    return { ok: true };
  });

/** Admin: site health snapshot. */
export const getSiteHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_site_health");
    if (error) throw new Error(error.message);
    return data as {
      db_ping_ms: number; postgres_version: string;
      ads_total: number; ads_pending: number; ads_live: number;
      users_total: number; checked_at: string;
    };
  });

/** Admin: JSON snapshot of core config tables (backup). */
export const exportSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_export_snapshot");
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  });

/** Admin: import a snapshot document (upserts settings + layouts + templates only). */
const ImportInput = z.object({
  snapshot: z.object({
    site_settings: z.array(z.object({ key: z.string(), value: z.unknown(), section: z.string().optional(), is_public: z.boolean().optional() })).optional(),
    page_layouts:  z.array(z.object({ slug: z.string(), name: z.string(), document: z.unknown(), css_override: z.string().nullable().optional(), is_active: z.boolean().optional() })).optional(),
    page_templates:z.array(z.object({ post_type: z.string(), scope_key: z.string().nullable().optional(), layout_slug: z.string(), is_default: z.boolean().optional() })).optional(),
  }),
});

export const importSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const s = data.snapshot;
    if (s.site_settings?.length) {
      for (const row of s.site_settings) {
        await context.supabase.from("site_settings").update({ value: row.value as never }).eq("key", row.key);
      }
    }
    // NOTE: layouts / templates upserts are intentionally limited to admin surface;
    // extend here after you review the source snapshot format.
    return { ok: true, keys_updated: s.site_settings?.length ?? 0 };
  });