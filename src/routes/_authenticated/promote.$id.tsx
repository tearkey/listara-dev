import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createStickyInvoice } from "@/lib/payments.functions";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";
import { Loader2, Sparkles, Check, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/promote/$id")({
  head: () => ({ meta: [{ title: `Promote your ad — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  validateSearch: z.object({ status: z.enum(["processing", "success", "cancel"]).optional() }),
  component: PromotePage,
});

const COINS = [
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "usdttrc20", label: "Tether (USDT · TRC20)" },
  { value: "ltc", label: "Litecoin (LTC)" },
  { value: "trx", label: "TRON (TRX)" },
] as const;

type Coin = (typeof COINS)[number]["value"];

function PromotePage() {
  const { id } = Route.useParams();
  const search = useSearch({ from: "/_authenticated/promote/$id" });
  const navigate = useNavigate();
  const [coin, setCoin] = useState<Coin>("btc");
  const createInvoice = useServerFn(createStickyInvoice);

  const mut = useMutation({
    mutationFn: () => createInvoice({ data: { listing_id: id, pay_currency: coin } }),
    onSuccess: (res) => {
      if (res?.invoice_url) {
        toast.success("Redirecting to secure crypto checkout…");
        window.location.href = res.invoice_url;
        return;
      }
      navigate({ to: "/promote/$id", params: { id }, search: { status: "processing" } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start payment"),
  });

  if (search.status === "processing" || search.status === "success") {
    return <WaitingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button onClick={() => navigate({ to: "/my-ads" })} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to My Ads
        </button>

        <h1 className="font-display text-3xl font-bold">Promote your ad</h1>
        <p className="mt-2 text-muted-foreground">Boost visibility with a Sticky placement paid in crypto.</p>

        <div className="mt-8 rounded-2xl border-2 border-brand bg-card p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                <Sparkles className="h-3 w-3" /> Premium
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold">Sticky — 7 days</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" /> Pinned to the top of its category</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" /> Highlighted card styling</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" /> 7 days of premium placement</li>
              </ul>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl font-bold">$10</div>
              <div className="text-xs text-muted-foreground">USD in crypto</div>
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-semibold">Preferred cryptocurrency</label>
            <Select value={coin} onValueChange={(v) => setCoin(v as Coin)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COINS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="mt-6 h-12 w-full bg-brand text-brand-foreground text-base font-semibold hover:bg-brand/90"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
          >
            {mut.isPending ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Creating invoice…</>
            ) : (
              <>Proceed to Crypto Payment</>
            )}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            You'll be redirected to NowPayments to complete the transaction.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}