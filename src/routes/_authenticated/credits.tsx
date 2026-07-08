import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { getMyCredits, createCreditTopupInvoice } from "@/lib/credits.functions";
import { Wallet, Bitcoin, Zap, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";

const PACKS = [
  { amount: 5, label: "$5", listings: 50, tag: "Starter" },
  { amount: 10, label: "$10", listings: 100, tag: "Popular" },
  { amount: 25, label: "$25", listings: 250, tag: "Value" },
  { amount: 50, label: "$50", listings: 500, tag: "Power poster" },
];

export const Route = createFileRoute("/_authenticated/credits")({
  head: () => ({
    meta: [
      { title: `Buy credits — ${BRAND.name}` },
      { name: "description", content: "Top up your posting credits. Each city listing costs $0.10." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: zodValidator(
    z.object({ topup: fallback(z.string(), "").default("") }),
  ),
  component: CreditsPage,
});

function CreditsPage() {
  const { topup } = useSearch({ from: "/_authenticated/credits" });
  const qc = useQueryClient();
  const { data: credits } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-credits"], queryFn: () => getMyCredits() }),
  );
  const balance = (credits.balance_cents / 100).toFixed(2);
  const cities = Math.floor(credits.balance_cents / 10);

  const invoiceFn = useServerFn(createCreditTopupInvoice);
  const [busy, setBusy] = useState<number | null>(null);

  async function buy(amount: number) {
    setBusy(amount);
    try {
      const { invoice_url } = await invoiceFn({ data: { amount_usd: amount } });
      qc.invalidateQueries({ queryKey: ["my-credits"] });
      window.location.href = invoice_url;
    } catch (e: any) {
      toast.error(e.message ?? "Could not start payment");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/post" className="hover:text-brand">Post an ad</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Buy credits</span>
        </nav>

        <h1 className="font-display text-3xl font-bold">Buy credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each city listing costs <span className="font-semibold text-foreground">$0.10</span>. Credits never expire.
        </p>

        {topup === "success" && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <div className="font-semibold">Payment received</div>
              <div className="text-muted-foreground">Your balance updates within a minute of blockchain confirmation.</div>
            </div>
          </div>
        )}
        {topup === "cancel" && (
          <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            Payment cancelled — you can try again anytime.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</div>
              <div className="font-display text-lg font-bold">${balance}</div>
              <div className="text-xs text-muted-foreground">{cities} city {cities === 1 ? "listing" : "listings"} available</div>
            </div>
          </div>
        </div>

        <h2 className="mt-8 font-display text-lg font-bold">Pick a pack</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PACKS.map((p) => (
            <div key={p.amount} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-display text-2xl font-bold">{p.label}</div>
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{p.tag}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Posts up to <span className="font-semibold text-foreground">{p.listings}</span> city listings.</p>
              </div>
              <Button
                onClick={() => buy(p.amount)}
                disabled={busy !== null}
                className="mt-4 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {busy === p.amount ? "Opening invoice…" : <>Pay {p.label} <Bitcoin className="ml-1 h-4 w-4" /></>}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
          <Zap className="h-4 w-4 shrink-0 text-brand" />
          <p>
            Payments are processed by NowPayments in your choice of crypto (BTC, USDT-TRC20, LTC, TRX and more).
            Your credits are added automatically after the payment confirms on-chain.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
