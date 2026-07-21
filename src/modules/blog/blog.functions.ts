import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "@/lib/supabase-public.server";

// Blog plugin server functions. Public reads go through the anon client (RLS
// already restricts to published posts); admin writes go through the service
// client after an explicit role check, mirroring admin.catalog.functions.ts.

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

async function assertBlogActive() {
  const { isModuleActive } = await import("@/lib/hooks/modules.server");
  if (!(await isModuleActive("blog"))) throw new Error("BLOG_DISABLED");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const PUBLIC_COLS =
  "id,slug,title,excerpt,body_markdown,cover_image,status,published_at,seo_title,meta_description,og_image,canonical_url,focus_keywords";

export const listPublishedPosts = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    await assertBlogActive();
    const sb = getPublicSupabase();
    const limit = data.limit ?? 20;
    const offset = data.offset ?? 0;
    const { data: posts, error, count } = await sb
      .from("blog_posts")
      .select("id,slug,title,excerpt,cover_image,published_at", { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { posts: posts ?? [], total: count ?? 0 };
  });

export const getPostBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    await assertBlogActive();
    const sb = getPublicSupabase();
    const { data: post, error } = await sb
      .from("blog_posts")
      .select(PUBLIC_COLS)
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return post;
  });

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export const adminListPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("blog_posts")
      .select("id,slug,title,excerpt,status,published_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminGetPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: post, error } = await supabaseAdmin
      .from("blog_posts")
      .select(PUBLIC_COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("Post not found");
    return post;
  });

const postUpsert = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().max(120).optional(),
  excerpt: z.string().trim().max(500).optional().nullable(),
  body_markdown: z.string().max(100_000),
  cover_image: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  status: z.enum(["draft", "published", "archived"]),
  seo_title: z.string().trim().max(120).optional().nullable(),
  meta_description: z.string().trim().max(300).optional().nullable(),
  og_image: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  canonical_url: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  focus_keywords: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});

export const adminUpsertPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => postUpsert.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row: Record<string, unknown> = {
      title: data.title,
      slug: data.slug?.trim() ? slugify(data.slug) : slugify(data.title),
      excerpt: data.excerpt || null,
      body_markdown: data.body_markdown,
      cover_image: data.cover_image || null,
      status: data.status,
      seo_title: data.seo_title || null,
      meta_description: data.meta_description || null,
      og_image: data.og_image || null,
      canonical_url: data.canonical_url || null,
      focus_keywords: data.focus_keywords ?? [],
    };

    if (data.id) {
      // First transition to published stamps published_at; re-publishing keeps
      // the original date so URLs and feeds stay stable.
      const { data: existing } = await supabaseAdmin
        .from("blog_posts")
        .select("published_at")
        .eq("id", data.id)
        .maybeSingle();
      if (data.status === "published" && !existing?.published_at) {
        row.published_at = new Date().toISOString();
      }
      const { data: res, error } = await supabaseAdmin
        .from("blog_posts")
        .update(row)
        .eq("id", data.id)
        .select("id,slug,status")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("audit_log").insert({
        actor_id: context.userId,
        action: "blog_post_update",
        target_table: "blog_posts",
        target_id: res.id,
        detail: { slug: res.slug, status: res.status },
      });
      return res;
    }

    row.author_id = context.userId;
    if (data.status === "published") row.published_at = new Date().toISOString();
    const { data: res, error } = await supabaseAdmin
      .from("blog_posts")
      .insert(row as any)
      .select("id,slug,status")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "blog_post_create",
      target_table: "blog_posts",
      target_id: res.id,
      detail: { slug: res.slug, status: res.status },
    });
    return res;
  });

export const adminDeletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "blog_post_delete",
      target_table: "blog_posts",
      target_id: data.id,
    });
    return { ok: true };
  });
