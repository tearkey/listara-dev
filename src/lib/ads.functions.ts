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
  city_ids: z.array(z.string().uuid()).min(1).max(100),
  category_id: z.string().uuid(),
  subcategory_id: z.string().uuid().optional().nullable(),
  price_cents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  contact_email: z.string().email().max(255).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  allow_messages: z.boolean().optional(),
});

const POST_COST_CENTS = 10; // $0.10 per city
const AD_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours per requirement

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject banned profiles up-front (is_banned is not exposed via the user client).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_banned) throw new Error("Your account is suspended.");

    // Banned-keyword scan via admin (read-only list, but RLS blocks anon)
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

    // Debit credits BEFORE inserting rows (10¢ per selected city). Rejected
    // ads still don't insert — we only charge if we accept the post.
    const cityIds = Array.from(new Set(data.city_ids));
    const cost = cityIds.length * POST_COST_CENTS;

    if (status !== "rejected") {
      // spend_credits is SECURITY DEFINER and now only executable by service_role.
      // Call it through the admin client with an explicit user id.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: spent, error: spendErr } = await supabaseAdmin.rpc("spend_credits", {
        _user_id: context.userId,
        _amount_cents: cost,
        _reason: cityIds.length > 1 ? `post_ad_multi_${cityIds.length}` : "post_ad_local",
      });
      if (spendErr) throw new Error(spendErr.message);
      if (!spent) {
        return { status: "insufficient_credits" as const, needed_cents: cost };
      }
    }

    const slug = slugify(data.title);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + AD_LIFETIME_MS).toISOString();

    if (status === "rejected") {
      // Insert a single rejected row for moderator audit; no city fanout, no charge.
      const { data: ad, error } = await supabase
        .from("ads")
        .insert({
          user_id: userId,
          city_id: cityIds[0],
          category_id: data.category_id,
          subcategory_id: data.subcategory_id ?? null,
          title: data.title, slug, body: data.body,
          price_cents: data.price_cents ?? null,
          contact_email: data.contact_email ?? null,
          contact_phone: data.contact_phone ?? null,
          allow_messages: data.allow_messages ?? true,
          status: "rejected",
        })
        .select("id,short_id,slug,status")
        .single();
      if (error) throw new Error(error.message);
      return { ...ad, status: ad.status as "rejected", posted_count: 0 };
    }

    // Insert one ad row per selected city (multi-city fanout).
    const rows = cityIds.map((cid) => ({
      user_id: userId,
      city_id: cid,
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
    }));

    const { data: ads, error } = await supabase
      .from("ads")
      .insert(rows)
      .select("id,short_id,slug,status");
    if (error) {
      // Refund credits on insert failure so users aren't charged for nothing.
      await supabaseAdmin.from("user_credits").update({
        balance_cents: (
          await supabaseAdmin.from("user_credits").select("balance_cents").eq("user_id", userId).maybeSingle()
        ).data?.balance_cents! + cost,
      }).eq("user_id", userId);
      await supabaseAdmin.from("credit_transactions").insert({
        user_id: userId, delta_cents: cost, reason: "refund_post_failed",
      });
      throw new Error(error.message);
    }
    return {
      id: ads[0].id,
      short_id: ads[0].short_id,
      slug: ads[0].slug,
      status: ads[0].status,
      posted_count: ads.length,
    };
  });

export const listMyAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ads")
      .select("id,short_id,slug,title,status,tier,posted_at,expires_at,view_count,rejection_reason,updated_at,cities(name,slug,states(code,slug)),categories(slug,name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Fetch one of the current user's ads (any status) for editing.
export const getMyAd = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // contact_email / contact_phone are SELECT-revoked from anon+authenticated
    // roles at the DB level; use the admin client after enforcing owner scope.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ad, error } = await supabaseAdmin
      .from("ads")
      .select("id,title,body,city_id,category_id,subcategory_id,price_cents,contact_email,contact_phone,allow_messages,status,tier,rejection_reason,cities(name,states(code))")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ad) throw new Error("Ad not found");
    return ad;
  });

// Edit a pending ad — user may adjust content, city, and promotion tier before
// it goes live. Only allowed while status='pending'.
const editPendingInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(4).max(120),
  body: z.string().trim().min(20).max(8000),
  city_id: z.string().uuid(),
  price_cents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  contact_email: z.string().email().max(255).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  tier: z.enum(["free", "bumped", "featured", "sticky"]).default("free"),
});

export const updatePendingAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => editPendingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: current, error: readErr } = await supabase
      .from("ads")
      .select("id,status")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Ad not found");
    if (current.status !== "pending") {
      throw new Error("Only pending ads can be edited. Live ads must be removed and re-posted.");
    }

    const { error } = await supabase
      .from("ads")
      .update({
        title: data.title,
        body: data.body,
        city_id: data.city_id,
        price_cents: data.price_cents ?? null,
        contact_email: data.contact_email ?? null,
        contact_phone: data.contact_phone ?? null,
        tier: data.tier,
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    // Rate limit: at most 5 reports per hour per user across all ads.
    // Combined with the (ad_id, reporter_id) partial-unique index on open
    // reports and DISTINCT-reporter counting in moderation_auto_takedown,
    // this prevents a single account from forcing a takedown via spam.
    const { data: allowed, error: rlErr } = await context.supabase.rpc("consume_rate_limit", {
      _action: "report_ad",
      _max: 5,
      _window_seconds: 60 * 60,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) throw new Error("You're reporting too quickly. Please try again later.");

    const { error } = await context.supabase.from("reports").insert({
      ad_id: data.ad_id,
      reporter_id: context.userId,
      reason: data.reason,
      detail: data.detail ?? null,
    });
    if (error) {
      // Partial unique index on (ad_id, reporter_id) WHERE status='open'
      // — swallow duplicate as a successful no-op so the UI stays idempotent.
      if ((error as any).code === "23505") return { ok: true, duplicate: true };
      throw new Error(error.message);
    }
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

    // Reject banned senders (is_banned isn't exposed via the user client).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: senderProfile } = await supabaseAdmin
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