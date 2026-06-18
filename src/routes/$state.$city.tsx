import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdCard } from "@/components/ad-card";
import { getCityBySlug, listCategories, listAdsInCity } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/$state/$city")({
  loader: async ({ context, params }) => {
    const cityOpts = queryOptions({
      queryKey: ["city", params.state, params.city],
      queryFn: () => getCityBySlug({ data: { stateSlug: params.state, citySlug: params.city } }),
    });
    const city = await context.queryClient.ensureQueryData(cityOpts);
    if (!city) throw notFound();
    const [cats, recent] = await Promise.all([
      context.queryClient.ensureQueryData(queryOptions({
        queryKey: ["categories"],
        queryFn: () => listCategories(),
      })),
      context.queryClient.ensureQueryData(queryOptions({
        queryKey: ["ads-city", city.id],
        queryFn: () => listAdsInCity({ data: { cityId: city.id, limit: 24 } }),
      })),
    ]);
    return { city, cats, recent };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] };
    const { city } = loaderData;
    const title = `${city.name}, ${city.states.code} classifieds — ${BRAND.name}`;
    const desc = `Browse free local classifieds in ${city.name}, ${city.states.name}. Jobs, housing, for sale, services, and more on ${BRAND.name}.`;
    return {
      meta: [
        { title }, { name: "description", content: desc },
        { property: "og:title", content: title }, { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
      ],
    };
  },
  errorComponent: ({ error }) => <div className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">City not found.</div>,
  component: CityPage,
});

function CityPage() {
  const { state, city } = Route.useParams();
  const cityOpts = queryOptions({
    queryKey: ["city", state, city],
    queryFn: () => getCityBySlug({ data: { stateSlug: state, citySlug: city } }),
  });
  const { data: c } = useSuspenseQuery(cityOpts);
  const { data: cats } = useSuspenseQuery(queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() }));
  const { data: recent } = useSuspenseQuery(queryOptions({
    queryKey: ["ads-city", c!.id], queryFn: () => listAdsInCity({ data: { cityId: c!.id, limit: 24 } }),
  }));

  if (!c) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="border-b border-border bg-gradient-to-br from-secondary via-background to-accent/20">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <nav className="text-xs text-muted-foreground"><Link to="/">Home</Link> / {c.states.name} / {c.name}</nav>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            <MapPin className="inline h-7 w-7 text-brand" /> {c.name}, {c.states.code}
          </h1>
          <p className="mt-1 text-muted-foreground">Local classifieds in {c.name}. Pick a category or scroll the latest listings.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="font-display text-xl font-bold">Categories in {c.name}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {cats.map((cat: any) => (
            <Link
              key={cat.id}
              to="/$state/$city/$category"
              params={{ state, city, category: cat.slug }}
              className="group rounded-2xl border border-border bg-card p-4 transition hover:border-brand hover:shadow-sm"
            >
              <div className="font-display text-base font-semibold group-hover:text-brand">{cat.name}</div>
              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{cat.description}</div>
              <div className="mt-2 inline-flex items-center text-xs font-medium text-brand">
                Browse <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="font-display text-xl font-bold">Latest in {c.name}</h2>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No listings yet — <Link to="/post" className="text-brand font-semibold">be the first to post</Link>.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {recent.map((ad: any) => <AdCard key={ad.id} ad={ad} />)}
          </div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}