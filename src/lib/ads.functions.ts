import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const adInput = z.object({
  title: z.string().trim().min(4).max(120),
  body: z.string().trim().min(20).max(8000),
  city_id: z.string().uuid(),
  category_id: z.string().uuid(),
  subcategory_id: z.string().uuid().optional().nullable(),
  price_cents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  contact_email: z.string().email().max(255).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  allow_messages: z.boolean().optional(),
});

export const createAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Rate limit: 5 posted ads per hour per user (best-effort, per-user DB counter).
    const { data: allowed, error: rlErr } = await supabase.rpc("consume_rate_limit", {
      _action: "post_ad",
      _max: 5,
      _window_seconds: 60 * 60,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) throw new Error("You're posting too quickly. Please try again later.");

    // Reject banned profiles up-front so they can't continue to post.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_banned) throw new Error("Your account is suspended.");

    // Banned-keyword scan via admin (read-only list, but RLS blocks anon)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: banned } = await supabaseAdmin
      .from("banned_keywords")
      .select("keyword,severity");
    const haystack = `${data.title}\n${data.body}`.toLowerCase();
    let status: "live" | "pending" | "rejected" = "live";
    for (const b of banned ?? []) {
      if (haystack.includes(b.keyword.toLowerCase())) {
        status = b.severity === "block" ? "rejected" : "pending";
        if (status === "rejected") break;
      }
    }

    const slug = slugify(data.title);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: ad, error } = await supabase
      .from("ads")
      .insert({
        user_id: userId,
        city_id: data.city_id,
        category_id: data.category_id,
        subcategory_id: data.subcategory_id ?? null,
        title: data.title,
        slug,
        body: data.body,
        price_cents: data.price_cents ?? null,
        contact_email: data.contact_email ?? null,
        contact_phone: data.contact_phone ?? null,
        allow_messages: data.allow_messages ?? true,
        status,
        posted_at: status === "live" ? now : null,
        expires_at: status === "live" ? expiresAt : null,
      })
      .select("id,short_id,slug,status")
      .single();
    if (error) throw new Error(error.message);
    return ad;
  });

export const listMyAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ads")
      .select("id,short_id,slug,title,status,tier,posted_at,expires_at,view_count,cities(name,slug,states(code,slug)),categories(slug,name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMyAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ads")
      .update({ status: "removed" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bumpMyAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Free bump once every 72 hours (Phase 1 — paid bump comes with Stripe wiring).
    const { data: ad } = await context.supabase
      .from("ads")
      .select("bumped_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!ad) throw new Error("Ad not found");
    if (ad.bumped_at) {
      const last = new Date(ad.bumped_at).getTime();
      if (Date.now() - last < 72 * 60 * 60 * 1000) {
        throw new Error("You can bump a free ad once every 72 hours.");
      }
    }
    const { error } = await context.supabase
      .from("ads")
      .update({ bumped_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ad_id: z.string().uuid(),
      reason: z.string().trim().min(3).max(80),
      detail: z.string().trim().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reports").insert({
      ad_id: data.ad_id,
      reporter_id: context.userId,
      reason: data.reason,
      detail: data.detail ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ad_id: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Rate limit: 20 messages per hour per user.
    const { data: allowed, error: rlErr } = await context.supabase.rpc("consume_rate_limit", {
      _action: "send_message",
      _max: 20,
      _window_seconds: 60 * 60,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) throw new Error("You're sending messages too quickly. Please slow down.");

    // Reject banned senders.
    const { data: senderProfile } = await context.supabase
      .from("profiles")
      .select("is_banned")
      .eq("id", context.userId)
      .maybeSingle();
    if (senderProfile?.is_banned) throw new Error("Your account is suspended.");

    // Recipient and city are derived server-side from the ad row — the client never
    // supplies recipient_id, sender_id, ad city, or any other field that could be spoofed.
    const { data: ad, error: adErr } = await context.supabase
      .from("ads")
      .select("user_id,allow_messages,status,city_id")
      .eq("id", data.ad_id)
      .maybeSingle();
    if (adErr) throw new Error(adErr.message);
    if (!ad || ad.status !== "live") throw new Error("Ad not available");
    if (!ad.allow_messages) throw new Error("This poster disabled messages");
    if (ad.user_id === context.userId) throw new Error("You can't message your own ad");
    if (!ad.city_id) throw new Error("Ad is missing a city scope");
    const { error } = await context.supabase.from("messages").insert({
      ad_id: data.ad_id,
      sender_id: context.userId,        // from verified session, not from input
      recipient_id: ad.user_id,         // derived from the ad row, not from input
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });