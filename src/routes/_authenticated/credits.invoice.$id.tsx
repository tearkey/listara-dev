import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";

// Server fn: fetch a single invoice the current user owns.
const getMyInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id,created_at,updated_at,status,kind,price_amount,price_currency,pay_amount,pay_currency,credit_cents,nowpayments_order_id,nowpayments_payment_id,invoice_url")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw notFound();
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    return { invoice: inv, buyer: { name: profile?.display_name ?? "", email: context.claims.email ?? "" } };
  });

export const Route = createFileRoute("/_authenticated/credits/invoice/$id")({
  head: () => ({ meta: [{ title: `Invoice — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: InvoicePage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Invoice not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn't find that invoice on your account.
      </p>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Could not load invoice</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function statusChip(status: string) {
  if (status === "paid") return { Icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Paid" };
  if (status === "pending") return { Icon: Hourglass, cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", label: "Pending payment" };
  return { Icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: status };
}

function InvoicePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["invoice", id], queryFn: () => getMyInvoice({ data: { id } }) }),
  );
  const inv = data.invoice;
  const chip = statusChip(inv.status);
  const Icon = chip.Icon;
  const credits = inv.credit_cents ? (inv.credit_cents / 100).toFixed(2) : null;
  const total = Number(inv.price_amount ?? 0).toFixed(2);

  return (
    <div className="min-h-screen bg-secondary/30 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link to="/credits/history" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand">
            <ArrowLeft className="h-3 w-3" /> Back to history
          </Link>
          <Button onClick={() => window.print()} className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Printer className="h-4 w-4 mr-1" /> Print / Save as PDF
          </Button>
        </div>

        <article className="rounded-2xl border border-border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
          {/* Header */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Invoice / Receipt</div>
              <div className="mt-1 font-display text-2xl font-bold">{BRAND.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Local classifieds · United States</div>
            </div>
            <div className="text-right text-xs">
              <div>
                <span className="text-muted-foreground">Invoice #</span>{" "}
                <span className="font-mono font-semibold">{inv.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="mt-0.5">
                <span className="text-muted-foreground">Date</span> {fmtDate(inv.created_at)}
              </div>
              {inv.nowpayments_order_id && (
                <div className="mt-0.5">
                  <span className="text-muted-foreground">Order</span>{" "}
                  <span className="font-mono">{inv.nowpayments_order_id}</span>
                </div>
              )}
              <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${chip.cls}`}>
                <Icon className="h-3 w-3" /> {chip.label}
              </div>
            </div>
          </header>

          {/* Bill to */}
          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Billed to</div>
              <div className="mt-1 text-sm font-semibold">{data.buyer.name || "Account holder"}</div>
              <div className="text-xs text-muted-foreground">{data.buyer.email}</div>
            </div>
            <div className="text-sm sm:text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment method</div>
              <div className="mt-1">
                Crypto{inv.pay_currency ? ` · ${inv.pay_currency.toUpperCase()}` : ""}
                {inv.pay_amount ? ` (${Number(inv.pay_amount).toFixed(6)})` : ""}
              </div>
            </div>
          </section>

          {/* Line items */}
          <section className="mt-8 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {inv.kind === "credit" ? "Credit top-up" : "Ad promotion"}
                    </div>
                    {credits && (
                      <div className="text-xs text-muted-foreground">
                        ${credits} added to wallet · covers up to {Math.floor((inv.credit_cents ?? 0) / 10)} city listings at $0.10 each
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">${total}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-secondary/40">
                  <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Total</td>
                  <td className="px-4 py-3 text-right font-display text-lg font-bold">${total} USD</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {inv.status !== "paid" && (
            <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              This invoice is not yet confirmed by the payment processor. Credits will appear on your wallet once the payment webhook is received.
            </p>
          )}

          <footer className="mt-8 border-t border-border pt-4 text-[11px] text-muted-foreground">
            Thanks for supporting {BRAND.name}. Keep this receipt for your records — you can reprint it any time from your transaction history.
          </footer>
        </article>
      </div>
    </div>
  );
}
