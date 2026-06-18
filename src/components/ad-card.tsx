import { Link } from "@tanstack/react-router";
import { Image as ImageIcon, Star, Pin, ArrowUp } from "lucide-react";

function formatPrice(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export interface AdCardData {
  short_id: string;
  slug: string;
  title: string;
  body: string;
  price_cents?: number | null;
  currency?: string;
  tier: "free" | "bumped" | "featured" | "sticky";
  posted_at?: string | null;
  bumped_at?: string | null;
  categories?: { slug: string; name: string } | null;
  cities?: { name: string; slug: string; states?: { slug: string; code?: string } | null } | null;
  ad_images?: Array<{ public_url: string; sort_order: number }> | null;
}

export function AdCard({ ad, hrefBase }: { ad: AdCardData; hrefBase?: string }) {
  const img = ad.ad_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0];
  const stateSlug = ad.cities?.states?.slug;
  const citySlug = ad.cities?.slug;
  const catSlug = ad.categories?.slug;
  const href = hrefBase ?? (stateSlug && citySlug && catSlug
    ? `/${stateSlug}/${citySlug}/${catSlug}/${ad.slug}-${ad.short_id}`
    : `/ad/${ad.short_id}`);

  return (
    <Link
      to={href}
      className="group flex gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-brand hover:shadow-sm"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary/60 sm:h-28 sm:w-28">
        {img ? (
          <img src={img.public_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        {ad.tier === "sticky" && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
            <Pin className="h-3 w-3" /> Top
          </span>
        )}
        {ad.tier === "featured" && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
            <Star className="h-3 w-3" /> Featured
          </span>
        )}
        {ad.tier === "bumped" && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            <ArrowUp className="h-3 w-3" /> Bumped
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug line-clamp-2 group-hover:text-brand">{ad.title}</h3>
          {formatPrice(ad.price_cents, ad.currency) && (
            <span className="shrink-0 rounded-md bg-secondary/80 px-2 py-0.5 text-sm font-bold text-foreground">
              {formatPrice(ad.price_cents, ad.currency)}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ad.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {ad.categories?.name && <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{ad.categories.name}</span>}
          {ad.cities?.name && <span>{ad.cities.name}{ad.cities.states?.code ? `, ${ad.cities.states.code}` : ""}</span>}
          {ad.posted_at && <span>· {timeAgo(ad.bumped_at ?? ad.posted_at)}</span>}
        </div>
      </div>
    </Link>
  );
}