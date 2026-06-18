import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdCard } from "@/components/ad-card";
import { getCityBySlug, getCategoryBySlug, listAdsInCity } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
  if (!c || !cat) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <nav className="text-xs text-muted-foreground">
            <Link to="/">Home</Link> / <Link to="/$state/$city" params={{ state, city }}>{c.name}, {c.states.code}</Link> / {cat.name}
          </nav>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold">{cat.name} in {c.name}</h1>
              <p className="text-sm text-muted-foreground">{ads.length} listing{ads.length === 1 ? "" : "s"}</p>
            </div>
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/post"><Plus className="h-4 w-4" /> Post in {cat.name}</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        {ads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">Nothing here yet in {c.name}.</p>
            <Button asChild className="mt-4 bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/post">Post the first ad</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-2">
            {ads.map((ad: any) => <AdCard key={ad.id} ad={ad} />)}
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}