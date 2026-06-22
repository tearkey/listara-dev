import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCityBySlug, getCategoryBySlug, listAdsInCity } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, MapPin, Image as ImageIcon, Star, Pin, ArrowUp, Filter } from "lucide-react";

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

function formatPrice(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export const Route = createFileRoute("/$state/$city/$category")({
  loader: async ({ context, params }) => {
    const city = await context.queryClient.ensureQueryData(queryOptions({
      queryKey: ["city", params.state, params.city],
      queryFn: () => getCityBySlug({ data: { stateSlug: params.state, citySlug: params.city } }),
    }));
    const cat = await context.queryClient.ensureQueryData(queryOptions({
      queryKey: ["category", params.category],
      queryFn: () => getCategoryBySlug({ data: { slug: params.category } }),
    }));
    if (!city || !cat) throw notFound();
    const ads = await context.queryClient.ensureQueryData(queryOptions({
      queryKey: ["ads-city-cat", city.id, cat.id],
      queryFn: () => listAdsInCity({ data: { cityId: city.id, categoryId: cat.id, limit: 60 } }),
    }));
    return { city, cat, ads };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] };
    const { city, cat } = loaderData;
    const title = `${cat.name} in ${city.name}, ${city.states.code} — ${BRAND.name}`;
    const desc = `Browse ${cat.name.toLowerCase()} listings in ${city.name}, ${city.states.name}. Post your own free on ${BRAND.name}.`;
    return { meta: [
      { title }, { name: "description", content: desc },
      { property: "og:title", content: title }, { property: "og:description", content: desc },
    ] };
  },
  errorComponent: ({ error }) => <div className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Category not found.</div>,
  component: BrowsePage,
});

function BrowsePage() {
  const { state, city, category } = Route.useParams();
  const { data: c } = useSuspenseQuery(queryOptions({
    queryKey: ["city", state, city], queryFn: () => getCityBySlug({ data: { stateSlug: state, citySlug: city } }),
  }));
  const { data: cat } = useSuspenseQuery(queryOptions({
    queryKey: ["category", category], queryFn: () => getCategoryBySlug({ data: { slug: category } }),
  }));
  const { data: ads } = useSuspenseQuery(queryOptions({
    queryKey: ["ads-city-cat", c!.id, cat!.id],
    queryFn: () => listAdsInCity({ data: { cityId: c!.id, categoryId: cat!.id, limit: 60 } }),
  }));
  const subs: Array<{ id: string; slug: string; name: string }> = cat?.subcategories ?? [];
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [withImagesOnly, setWithImagesOnly] = useState(false);

  const filtered = useMemo(() => {
    const min = minPrice ? Number(minPrice) * 100 : null;
    const max = maxPrice ? Number(maxPrice) * 100 : null;
    const kw = keyword.trim().toLowerCase();
    return ads
      .filter((a: any) => (selectedSubs.size === 0 ? true : a.subcategory_id && selectedSubs.has(a.subcategory_id)))
      .filter((a: any) => (kw ? `${a.title} ${a.body}`.toLowerCase().includes(kw) : true))
      .filter((a: any) => (min == null ? true : (a.price_cents ?? 0) >= min))
      .filter((a: any) => (max == null ? true : (a.price_cents ?? Number.POSITIVE_INFINITY) <= max))
      .filter((a: any) => (withImagesOnly ? (a.ad_images?.length ?? 0) > 0 : true))
      .slice()
      .sort((a: any, b: any) => {
        const ta = new Date(a.bumped_at ?? a.posted_at ?? 0).getTime();
        const tb = new Date(b.bumped_at ?? b.posted_at ?? 0).getTime();
        return tb - ta;
      });
  }, [ads, selectedSubs, keyword, minPrice, maxPrice, withImagesOnly]);

  if (!c || !cat) return null;

  const toggleSub = (id: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setSelectedSubs(new Set());
    setKeyword("");
    setMinPrice("");
    setMaxPrice("");
    setWithImagesOnly(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <nav className="text-xs text-muted-foreground">
            <Link to="/">Home</Link> /{" "}
            <Link to="/$state/$city" params={{ state, city }} className="hover:text-brand">
              {c.name}, {c.states.code}
            </Link>{" "}
            / {cat.name}
          </nav>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold">
              <MapPin className="inline h-5 w-5 text-brand" /> {cat.name} in {c.name}
            </h1>
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/post"><Plus className="h-4 w-4" /> Post in {cat.name}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* Left sidebar — filters */}
          <aside className="space-y-5 rounded-2xl border border-border bg-card p-4 h-fit lg:sticky lg:top-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Filter className="h-4 w-4 text-brand" /> Filters
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-1 text-xs text-muted-foreground underline hover:text-brand"
              >
                Reset all
              </button>
            </div>

            <div>
              <Label htmlFor="kw" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Keyword
              </Label>
              <Input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search in results" className="mt-1" />
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price range</div>
              <div className="mt-1 flex items-center gap-2">
                <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Min $" inputMode="numeric" />
                <span className="text-muted-foreground">–</span>
                <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Max $" inputMode="numeric" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={withImagesOnly} onCheckedChange={(v) => setWithImagesOnly(Boolean(v))} />
              Has photos
            </label>

            {subs.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subcategories</div>
                <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {subs.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedSubs.has(s.id)}
                        onCheckedChange={() => toggleSub(s.id)}
                      />
                      <span className="line-clamp-1">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Right feed — chronological text listings */}
          <div>
            <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted-foreground">
              <span>{filtered.length} of {ads.length} listing{ads.length === 1 ? "" : "s"} · newest first</span>
            </div>

            {filtered.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
                <p className="text-muted-foreground">No listings match your filters.</p>
                <Button asChild className="mt-4 bg-brand text-brand-foreground hover:bg-brand/90">
                  <Link to="/post">Post the first ad</Link>
                </Button>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {filtered.map((ad: any) => {
                  const img = ad.ad_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
                  const href = `/${state}/${city}/${cat.slug}/${ad.slug}-${ad.short_id}`;
                  return (
                    <li key={ad.id}>
                      <Link
                        to={href}
                        className="group flex items-start gap-3 py-3 transition hover:bg-secondary/40 -mx-2 px-2 rounded-md"
                      >
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary/60">
                          {img ? (
                            <img src={img.public_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="truncate font-medium text-foreground group-hover:text-brand">
                              {ad.tier === "sticky" && <Pin className="inline h-3 w-3 mr-1 text-accent-foreground" />}
                              {ad.tier === "featured" && <Star className="inline h-3 w-3 mr-1 text-brand" />}
                              {ad.tier === "bumped" && <ArrowUp className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                              {ad.title}
                            </h3>
                            {formatPrice(ad.price_cents, ad.currency) && (
                              <span className="shrink-0 text-sm font-semibold">{formatPrice(ad.price_cents, ad.currency)}</span>
                            )}
                          </div>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{ad.body}</p>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {timeAgo(ad.bumped_at ?? ad.posted_at)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}