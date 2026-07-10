import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LayoutDocumentSchema, type LayoutDocument } from "./page-builder.schema";

/** Public: fetch an active layout by slug (SSR-safe). */
export const getLayoutBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: row, error } = await supabase
      .from("page_layouts")
      .select("slug,name,document,css_override,version")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      slug: row.slug,
      name: row.name,
      version: row.version,
      css_override: row.css_override,
      document: row.document as unknown as LayoutDocument,
    };
  });

/** Public: resolve the layout assigned to a post-type / scope. */
export const getTemplateFor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ post_type: z.string(), scope_key: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // Try scoped first, fall back to default
    let q = supabase.from("page_templates").select("layout_id").eq("post_type", data.post_type);
    q = data.scope_key ? q.eq("scope_key", data.scope_key) : q.is("scope_key", null);
    const { data: tpl } = await q.maybeSingle();
    if (!tpl) return null;
    const { data: layout } = await supabase
      .from("page_layouts")
      .select("slug,name,document,css_override,version")
      .eq("id", tpl.layout_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!layout) return null;
    return {
      slug: layout.slug,
      name: layout.name,
      version: layout.version,
      css_override: layout.css_override,
      document: layout.document as unknown as LayoutDocument,
    };
  });

/** Admin: create or update a layout (validates JSON against the schema). */
const SaveLayoutInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  document: LayoutDocumentSchema,
  css_override: z.string().max(20000).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const saveLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveLayoutInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      document: data.document as never,
      css_override: data.css_override ?? null,
      is_active: data.is_active,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("page_layouts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("page_layouts").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

/** Admin: assign a layout to a post-type. */
const AssignInput = z.object({
  post_type: z.enum(["blog_single", "blog_archive", "ad_single", "ad_archive", "home", "custom"]),
  scope_key: z.string().nullable().optional(),
  layout_id: z.string().uuid(),
  is_default: z.boolean().default(false),
});
export const assignTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("page_templates").upsert(
      {
        post_type: data.post_type,
        scope_key: data.scope_key ?? null,
        layout_id: data.layout_id,
        is_default: data.is_default,
      } as never,
      { onConflict: "post_type,scope_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });