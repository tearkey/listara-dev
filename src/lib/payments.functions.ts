import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STICKY_PRICE_USD = 10;
const ALLOWED_CURRENCIES = ["btc", "usdttrc20", "ltc", "trx"] as const;

export const createStickyInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      listing_id: z.string().uuid(),
      pay_currency: z.enum(ALLOWED_CURRENCIES).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("Payment provider is not configured");

    // Abuse guard: cap sticky invoice creation per user (10 / 10 minutes).
    const { data: allowed, error: rlErr } = await context.supabase.rpc("consume_rate_limit", {
      _action: "sticky_invoice",
      _max: 10,
      _window_seconds: 600,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) throw new Error("Too many upgrade attempts. Please wait a few minutes and try again.");

    // Confirm caller owns the listing
    const { data: listing, error: listingErr } = await context.supabase
      .from("listings")
      .select("id,user_id,title,status")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (listingErr) throw new Error(listingErr.message);
    if (!listing || listing.user_id !== context.userId) {
      throw new Error("Listing not found");
    }

    const orderId = `sticky_${listing.id}_${Date.now()}`;
    const origin =
      process.env.PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      "https://example.com";

    const payload: Record<string, unknown> = {
      price_amount: STICKY_PRICE_USD,
      price_currency: "usd",
      order_id: orderId,
      order_description: `Sticky upgrade (7 days) — ${listing.title}`,
      ipn_callback_url: `${origin}/api/public/webhooks/nowpayments`,
      success_url: `${origin}/dashboard?sticky=success`,
      cancel_url: `${origin}/dashboard?sticky=cancel`,
    };
    if (data.pay_currency) payload.pay_currency = data.pay_currency;

    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("NowPayments invoice creation failed", res.status, detail);
      throw new Error("Could not create crypto invoice. Please try again.");
    }
    const invoice = (await res.json()) as {
      id?: string;
      invoice_url?: string;
      order_id?: string;
    };
    if (!invoice.invoice_url) throw new Error("Payment provider returned no invoice URL");

    // Insert pending invoice via service role (RLS restricts inserts)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insertErr } = await supabaseAdmin.from("invoices").insert({
      listing_id: listing.id,
      user_id: context.userId,
      nowpayments_order_id: invoice.order_id ?? orderId,
      nowpayments_payment_id: invoice.id ?? null,
      price_amount: STICKY_PRICE_USD,
      price_currency: "usd",
      pay_currency: data.pay_currency ?? null,
      invoice_url: invoice.invoice_url,
      status: "pending",
      raw_payload: invoice as never,
    });
    if (insertErr) {
      console.error("Failed to record invoice", insertErr);
      throw new Error("Could not record invoice");
    }

    return { invoice_url: invoice.invoice_url };
  });