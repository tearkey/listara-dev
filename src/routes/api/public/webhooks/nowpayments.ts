import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// NowPayments IPN: HMAC-SHA512 of the JSON body with keys sorted
// alphabetically (recursively), using the IPN secret. Sent in the
// `x-nowpayments-sig` header. https://documenter.getpostman.com/view/7907941/2s93JusNJt

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortObject((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

const CONFIRMED_STATES = new Set(["finished", "confirmed", "sending"]);
const FAILED_STATES = new Set(["failed", "expired", "refunded"]);

export const Route = createFileRoute("/api/public/webhooks/nowpayments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!secret) return new Response("Not configured", { status: 500 });

        const signature = request.headers.get("x-nowpayments-sig") ?? "";
        const rawBody = await request.text();

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const canonical = JSON.stringify(sortObject(parsed));
        const expected = createHmac("sha512", secret).update(canonical).digest("hex");

        const sigBuf = Buffer.from(signature, "utf8");
        const expBuf = Buffer.from(expected, "utf8");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const orderId = String(parsed.order_id ?? "");
        const paymentId = parsed.payment_id != null ? String(parsed.payment_id) : null;
        const status = String(parsed.payment_status ?? "").toLowerCase();
        const payAmount = parsed.pay_amount != null ? Number(parsed.pay_amount) : null;
        const payCurrency = parsed.pay_currency ? String(parsed.pay_currency) : null;

        if (!orderId) return new Response("Missing order_id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: invoice, error: findErr } = await supabaseAdmin
          .from("invoices")
          .select("id,listing_id,status")
          .eq("nowpayments_order_id", orderId)
          .maybeSingle();
        if (findErr) {
          console.error("Webhook invoice lookup failed", findErr);
          return new Response("Lookup failed", { status: 500 });
        }
        if (!invoice) return new Response("Unknown invoice", { status: 404 });

        let nextStatus: "pending" | "paid" | "failed" | "refunded" = "pending";
        if (CONFIRMED_STATES.has(status)) nextStatus = "paid";
        else if (FAILED_STATES.has(status)) {
          nextStatus = status === "refunded" ? "refunded" : "failed";
        }

        const { error: updateErr } = await supabaseAdmin
          .from("invoices")
          .update({
            status: nextStatus,
            nowpayments_payment_id: paymentId,
            pay_amount: payAmount,
            pay_currency: payCurrency,
            raw_payload: parsed as never,
          })
          .eq("id", invoice.id);
        if (updateErr) {
          console.error("Webhook invoice update failed", updateErr);
          return new Response("Update failed", { status: 500 });
        }

        // Only flip the listing when the payment fully confirms and we
        // haven't already applied this invoice (idempotent).
        if (nextStatus === "paid" && invoice.status !== "paid" && invoice.listing_id) {
          const stickyUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const { error: listingErr } = await supabaseAdmin
            .from("listings")
            .update({ sticky_until: stickyUntil })
            .eq("id", invoice.listing_id);
          if (listingErr) {
            console.error("Failed to apply sticky upgrade", listingErr);
            return new Response("Listing update failed", { status: 500 });
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});