import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export const adminListCities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ q: z.string().trim().max(120).optional(), stateId: z.string().uuid().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("cities")
      .select("id,name,slug,population,is_featured,state_id,states(code,name)")
      .order("name")
      .limit(500);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    if (data.stateId) q = q.eq("state_id", data.stateId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const cityUpsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).optional(),
  state_id: z.string().uuid(),
  population: z.number().int().min(0).max(50_000_000).nullable().optional(),
  is_featured: z.boolean().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const adminUpsertCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => cityUpsert.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      slug: data.slug?.trim() ? slugify(data.slug) : slugify(data.name),
      state_id: data.state_id,
      population: data.population ?? null,
      is_featured: data.is_featured ?? false,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
    const q = data.id
      ? supabaseAdmin.from("cities").update(row).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("cities").insert(row).select("id").single();
    const { data: res, error } = await q;
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.id ? "city_update" : "city_create",
      target_table: "cities",
      target_id: res.id,
      detail: row,
    });
    return res;
  });

export const adminDeleteCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("city_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete: ${count} ads reference this city`);
    }
    const { error } = await supabaseAdmin.from("cities").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "city_delete",
      target_table: "cities",
      target_id: data.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const adminListCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select(
        "id,slug,name,description,icon,sort_order,is_paid_only,base_price_cents,subcategories(id,slug,name,sort_order)",
      )
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const categoryUpsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(80).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_paid_only: z.boolean().optional(),
  base_price_cents: z.number().int().min(0).max(100_000_00).optional(),
});

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => categoryUpsert.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      slug: data.slug?.trim() ? slugify(data.slug) : slugify(data.name),
      description: data.description ?? null,
      icon: data.icon ?? null,
      sort_order: data.sort_order ?? 0,
      is_paid_only: data.is_paid_only ?? false,
      base_price_cents: data.base_price_cents ?? 0,
    };
    const q = data.id
      ? supabaseAdmin.from("categories").update(row).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("categories").insert(row).select("id").single();
    const { data: res, error } = await q;
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.id ? "category_update" : "category_create",
      target_table: "categories",
      target_id: res.id,
      detail: row,
    });
    return res;
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete: ${count} ads reference this category`);
    }
    await supabaseAdmin.from("subcategories").delete().eq("category_id", data.id);
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "category_delete",
      target_table: "categories",
      target_id: data.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Subcategories
// ---------------------------------------------------------------------------

const subcatUpsert = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const adminUpsertSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => subcatUpsert.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      category_id: data.category_id,
      name: data.name,
      slug: data.slug?.trim() ? slugify(data.slug) : slugify(data.name),
      sort_order: data.sort_order ?? 0,
    };
    const q = data.id
      ? supabaseAdmin.from("subcategories").update(row).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("subcategories").insert(row).select("id").single();
    const { data: res, error } = await q;
    if (error) throw new Error(error.message);
    return res;
  });

export const adminDeleteSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("subcategory_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete: ${count} ads reference this subcategory`);
    }
    const { error } = await supabaseAdmin.from("subcategories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("states")
      .select("id,code,name,slug")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });