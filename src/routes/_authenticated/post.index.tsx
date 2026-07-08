import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyCredits } from "@/lib/credits.functions";
import { MapPin, Globe2, ChevronRight, Wallet, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/post/")({
  head: () => ({
    meta: [
      { title: `Post an ad — ${BRAND.name}` },
      { name: "description", content: "Choose to post in a single city or fan your ad out across multiple US cities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PostChooser,
});

function PostChooser() {
  const { data: credits } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-credits"], queryFn: () => getMyCredits() }),
  );
  const balance = (credits.balance_cents / 100).toFixed(2);
  const cities = Math.floor(credits.balance_cents / 10);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Post an ad</span>
        </nav>

        <h1 className="font-display text-3xl font-bold">Post An Ad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each city listing costs <span className="font-semibold text-foreground">$0.10</span>, deducted from your credit balance.
        </p>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Your credits</div>
              <div className="font-display text-lg font-bold">${balance}</div>
              <div className="text-xs text-muted-foreground">enough to post {cities} {cities === 1 ? "city listing" : "city listings"}</div>
            </div>
          </div>
          <Link
            to="/credits"
            className="inline-flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            Buy credits <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <ul className="mt-6 space-y-3">
          <li>
            <Link
              to="/post/local"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-brand hover:bg-brand/5"
            >
              <div className="flex items-start gap-4">
                <span className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-display text-lg font-bold group-hover:text-brand">Post local ad</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Publish in a single city. <span className="font-semibold text-foreground">$0.10</span> deducted at publish.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          </li>
          <li>
            <Link
              to="/post/multi"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-brand hover:bg-brand/5"
            >
              <div className="flex items-start gap-4">
                <span className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Globe2 className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-display text-lg font-bold group-hover:text-brand">Post in multiple cities</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Pick any US cities across any states. Total updates live —
                    <span className="font-semibold text-foreground"> $0.10 × cities selected</span>.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          </li>
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
