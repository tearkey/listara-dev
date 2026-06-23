import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";

export const listStates = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicSupabase();
  const { data, error } = await sb.from("states").select("id,code,name,slug").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFeaturedCities = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicSupabase();
  const { data, error } = await sb
    .from("cities")
    .select("id,name,slug,population,state_id,states(code,name,slug)")
    .eq("is_featured", true)
    .order("population", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("id,slug,name,description,icon,sort_order,is_paid_only,base_price_cents,subcategories(id,slug,name,sort_order)")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getCityBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ stateSlug: z.string(), citySlug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicSupabase();
    const { data: city, error } = await sb
      .from("cities")
      .select("id,name,slug,population,state_id,states!inner(id,code,name,slug)")
      .eq("slug", data.citySlug)
      .eq("states.slug", data.stateSlug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return city;
  });

export const getCategoryBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicSupabase();
    const { data: cat, error } = await sb
      .from("categories")
      .select("id,slug,name,description,icon,subcategories(id,slug,name,sort_order)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return cat;
  });

export const listAdsInCity = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({
      cityId: z.string().uuid(),
      categoryId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = getPublicSupabase();
    let q = sb
      .from("ads")
      .select("id,short_id,slug,title,body,price_cents,currency,tier,posted_at,bumped_at,view_count,report_count,category_id,subcategory_id,categories(slug,name),ad_images(public_url,sort_order)")
      .eq("city_id", data.cityId)
      .eq("status", "live");
    if (data.categoryId) q = q.eq("category_id", data.categoryId);
    q = q.order("tier", { ascending: false }).order("bumped_at", { ascending: false, nullsFirst: false }).order("posted_at", { ascending: false });
    const { data: ads, error } = await q.limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return ads ?? [];
  });

export const getAdByShortId = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ shortId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicSupabase();
    const { data: ad, error } = await sb
      .from("ads")
      // contact_email & contact_phone are intentionally excluded from the public payload —
      // anonymous viewers never receive them. Authenticated viewers fetch via getAdContact.
      .select("id,short_id,slug,title,body,price_cents,currency,tier,posted_at,view_count,user_id,allow_messages,city_id,category_id,subcategory_id,cities(name,slug,states(code,name,slug)),categories(slug,name),subcategories(slug,name),ad_images(public_url,sort_order),profiles(display_name,avatar_url,reputation)")
      .eq("short_id", data.shortId)
      .eq("status", "live")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (ad) {
      // best-effort view increment via service role would be nicer; skip for SSR speed
    }
    return ad;
  });

// Authenticated-only contact reveal. Returns contact fields only to signed-in users
// for a live ad. The auth middleware rejects anonymous callers (401), so contact
// info never appears in any anonymous API payload.
export const getAdContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ adId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ad, error } = await supabase
      .from("ads")
      .select("id,status,contact_email,contact_phone")
      .eq("id", data.adId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ad || ad.status !== "live") throw new Error("Ad not available");
    return { contact_email: ad.contact_email, contact_phone: ad.contact_phone };
  });

export const searchAds = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ q: z.string().min(1).max(200), limit: z.number().int().min(1).max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicSupabase();
    const { data: ads, error } = await sb
      .from("ads")
      .select("id,short_id,slug,title,body,price_cents,currency,tier,posted_at,city_id,cities(name,slug,states(slug,code)),categories(slug,name),ad_images(public_url,sort_order)")
      .eq("status", "live")
      .textSearch("search_vector", data.q, { type: "websearch" })
      .order("tier", { ascending: false })
      .order("posted_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);
    return ads ?? [];
  });