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
import { Input } from "@/components/ui/input";
import { getMyCredits, createCreditTopupInvoice } from "@/lib/credits.functions";
import { Wallet, Bitcoin, Zap, CheckCircle2, Receipt, Info } from "lucide-react";
import { BRAND } from "@/lib/brand";

const MIN_TOPUP = 20;

const PACKS = [
  { amount: 20, label: "$20", listings: 200, tag: "Starter" },
  { amount: 50, label: "$50", listings: 500, tag: "Popular" },
  { amount: 100, label: "$100", listings: 1000, tag: "Best value" },
  { amount: 250, label: "$250", listings: 2500, tag: "Power poster" },
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
  const [custom, setCustom] = useState<string>("");

  async function buy(amount: number) {
    if (!Number.isFinite(amount) || amount < MIN_TOPUP) {
      toast.error(`Minimum deposit is $${MIN_TOPUP}.`);
      return;
    }
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

  function buyCustom() {
    const n = Math.floor(Number(custom));
    buy(n);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Buy credits</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Buy credits</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each city listing costs <span className="font-semibold text-foreground">$0.10</span>. Credits never expire.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/credits/history"><Receipt className="h-4 w-4" /> Transaction history</Link>
          </Button>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>Minimum deposit is <span className="font-semibold">${MIN_TOPUP}</span>. Payments are non-refundable once credits are added to your wallet.</p>
        </div>

        {topup === "success" && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <div className="font-semibold">Payment received</div>
              <div className="text-muted-foreground">Your balance updates within a minute of blockchain confirmation. Check the <Link to="/credits/history" className="text-brand hover:underline">transaction history</Link>.</div>
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
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/post">Post an ad</Link>
          </Button>
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

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-bold">Or enter a custom amount</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Whole USD only. Minimum ${MIN_TOPUP}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="number" inputMode="numeric" min={MIN_TOPUP} step={1}
                placeholder={`${MIN_TOPUP}`}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="pl-6"
              />
            </div>
            <Button onClick={buyCustom} disabled={busy !== null} className="bg-brand text-brand-foreground hover:bg-brand/90">
              Pay & top up
            </Button>
          </div>
          {custom && Number(custom) >= MIN_TOPUP && (
            <p className="mt-2 text-xs text-muted-foreground">
              That's up to <span className="font-semibold text-foreground">{Math.floor(Number(custom) * 10)}</span> city listings at $0.10 each.
            </p>
          )}
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
