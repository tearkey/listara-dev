import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";

// Read the signed-in user's credit balance (in cents).
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_credits")
      .select("balance_cents,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { balance_cents: data?.balance_cents ?? 0, updated_at: data?.updated_at ?? null };
  });

// List every state with its featured cities — used by the multi-city picker.
export const listStatesWithCities = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicSupabase();
  const { data: states, error: sErr } = await sb
    .from("states")
    .select("id,code,name,slug")
    .order("name");
  if (sErr) throw new Error(sErr.message);
  const { data: cities, error: cErr } = await sb
    .from("cities")
    .select("id,name,slug,state_id")
    .eq("is_featured", true)
    .order("name");
  if (cErr) throw new Error(cErr.message);
  const byState = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const c of cities ?? []) {
    const arr = byState.get(c.state_id) ?? [];
    arr.push({ id: c.id, name: c.name, slug: c.slug });
    byState.set(c.state_id, arr);
  }
  return (states ?? []).map((s) => ({ ...s, cities: byState.get(s.id) ?? [] }));
});

const TOPUP_MIN_USD = 20;
const TOPUP_MAX_USD = 5000;

// Create a NowPayments invoice to top up the signed-in user's credit wallet.
export const createCreditTopupInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amount_usd: z.number().int().min(TOPUP_MIN_USD).max(TOPUP_MAX_USD),
      pay_currency: z.enum(["btc", "usdttrc20", "ltc", "trx"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("Payment provider is not configured");

    const orderId = `credits_${context.userId}_${Date.now()}`;
    const origin =
      process.env.PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      "https://example.com";

    const payload: Record<string, unknown> = {
      price_amount: data.amount_usd,
      price_currency: "usd",
      order_id: orderId,
      order_description: `Credit top-up ($${data.amount_usd}) — post ${data.amount_usd * 10} more city listings`,
      ipn_callback_url: `${origin}/api/public/webhooks/nowpayments`,
      success_url: `${origin}/credits?topup=success`,
      cancel_url: `${origin}/credits?topup=cancel`,
    };
    if (data.pay_currency) payload.pay_currency = data.pay_currency;

    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("NowPayments topup invoice failed", res.status, await res.text());
      throw new Error("Could not create top-up invoice. Please try again.");
    }
    const invoice = (await res.json()) as {
      id?: string;
      invoice_url?: string;
      order_id?: string;
    };
    if (!invoice.invoice_url) throw new Error("Payment provider returned no invoice URL");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insertErr } = await supabaseAdmin.from("invoices").insert({
      user_id: context.userId,
      kind: "credit",
      credit_cents: data.amount_usd * 100,
      nowpayments_order_id: invoice.order_id ?? orderId,
      nowpayments_payment_id: invoice.id ?? null,
      price_amount: data.amount_usd,
      price_currency: "usd",
      pay_currency: data.pay_currency ?? null,
      invoice_url: invoice.invoice_url,
      status: "pending",
      raw_payload: invoice as never,
    });
    if (insertErr) {
      console.error("Failed to record topup invoice", insertErr);
      throw new Error("Could not record invoice");
    }

    return { invoice_url: invoice.invoice_url };
  });
