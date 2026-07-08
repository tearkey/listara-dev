import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { listMyCreditTransactions, listMyInvoices, getMyCredits } from "@/lib/credits.functions";
import { BRAND } from "@/lib/brand";
import {
  ArrowDownRight, ArrowUpRight, ExternalLink, Wallet, Clock,
  CheckCircle2, XCircle, Hourglass, Receipt,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/credits/history")({
  head: () => ({
    meta: [
      { title: `Transaction history — ${BRAND.name}` },
      { name: "description", content: "Every credit purchase, webhook confirmation and ad-posting debit." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

function fmtCents(cents: number) {
  const sign = cents < 0 ? "-" : "+";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function reasonLabel(reason: string) {
  if (reason === "topup") return "Credit top-up";
  if (reason === "post_ad_local") return "Ad posted (1 city)";
  if (reason.startsWith("post_ad_multi_")) return `Ad posted (${reason.replace("post_ad_multi_", "")} cities)`;
  if (reason === "refund_post_failed") return "Refund — post failed";
  return reason.replace(/_/g, " ");
}

function statusBadge(status: string) {
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    paid: { icon: CheckCircle2, cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", label: "Confirmed" },
    pending: { icon: Hourglass, cls: "text-amber-500 bg-amber-500/10 border-amber-500/30", label: "Pending webhook" },
    failed: { icon: XCircle, cls: "text-destructive bg-destructive/10 border-destructive/30", label: "Failed" },
    expired: { icon: XCircle, cls: "text-muted-foreground bg-secondary border-border", label: "Expired" },
    refunded: { icon: ArrowDownRight, cls: "text-muted-foreground bg-secondary border-border", label: "Refunded" },
  };
  const it = map[status] ?? { icon: Clock, cls: "text-muted-foreground bg-secondary border-border", label: status };
  const Icon = it.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${it.cls}`}>
      <Icon className="h-3 w-3" /> {it.label}
    </span>
  );
}

function HistoryPage() {
  const { data: credits } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-credits"], queryFn: () => getMyCredits() }),
  );
  const { data: txs } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-credit-txs"], queryFn: () => listMyCreditTransactions() }),
  );
  const { data: invoices } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-invoices"], queryFn: () => listMyInvoices() }),
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/credits" className="hover:text-brand">Buy credits</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Transaction history</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Transaction history</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every top-up, webhook confirmation and ad debit — timestamped.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</div>
              <div className="flex items-center gap-1.5 font-display text-lg font-bold">
                <Wallet className="h-4 w-4 text-brand" />${(credits.balance_cents / 100).toFixed(2)}
              </div>
            </div>
            <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/credits">Buy more</Link>
            </Button>
          </div>
        </div>

        {/* Invoices (payment attempts + webhook status) */}
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Receipt className="h-4 w-4 text-brand" /> Payments
          </h2>
          {invoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No payments yet. <Link to="/credits" className="font-semibold text-brand">Top up your wallet</Link>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Order</th>
                    <th className="px-4 py-2.5 text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.created_at)}</td>
                      <td className="px-4 py-3 font-semibold">${Number(inv.price_amount ?? 0).toFixed(2)}<span className="ml-1 text-[11px] font-normal uppercase text-muted-foreground">{inv.pay_currency ?? ""}</span></td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{inv.nowpayments_order_id ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {inv.invoice_url ? (
                          <a href={inv.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Ledger — credits added and spent */}
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Wallet className="h-4 w-4 text-brand" /> Credit ledger
          </h2>
          {txs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No credit movements yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {txs.map((t) => {
                  const positive = t.delta_cents > 0;
                  const Icon = positive ? ArrowUpRight : ArrowDownRight;
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${positive ? "bg-emerald-500/10 text-emerald-500" : "bg-brand/10 text-brand"}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="font-semibold">{reasonLabel(t.reason)}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtDate(t.created_at)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-display text-base font-bold ${positive ? "text-emerald-500" : "text-foreground"}`}>{fmtCents(t.delta_cents)}</div>
                        {t.invoice?.status && positive && (
                          <div className="mt-0.5">{statusBadge(t.invoice.status)}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
