import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, ArrowRight, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCityBySlug, listCategories, listAdsInCity } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";

// Groups visible on the city index. Each group maps to one or more
// category slugs from the DB.
const CATEGORY_GROUPS: { label: string; slugs: string[] }[] = [
  { label: "Services", slugs: ["services", "gigs"] },
  { label: "Buy / Sell / Trade", slugs: ["for-sale", "vehicles"] },
  { label: "Community", slugs: ["community", "housing"] },
  { label: "Jobs", slugs: ["jobs"] },
  { label: "Personals", slugs: ["personals"] },
];

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
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <nav className="text-xs text-muted-foreground"><Link to="/">Home</Link> / {c.states.name} / {c.name}</nav>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-xl font-bold md:text-2xl">
              <MapPin className="inline h-5 w-5 text-brand" /> Current Location:{" "}
              <span className="text-brand">{c.name}, {c.states.code}</span>
            </h1>
            <Link to="/" className="text-xs font-medium text-muted-foreground underline hover:text-brand">
              Change Location
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CATEGORY_GROUPS.map((group) => {
            const groupCats = cats.filter((cat: any) => group.slugs.includes(cat.slug));
            return (
              <div key={group.label} className="rounded-2xl border border-border bg-card p-4">
                <h2 className="font-display text-lg font-bold text-brand">{group.label}</h2>
                <div className="mt-3 space-y-3">
                  {groupCats.map((cat: any) => (
                    <div key={cat.id}>
                      <Link
                        to="/$state/$city/$category"
                        params={{ state, city, category: cat.slug }}
                        className="inline-flex items-center gap-1 font-semibold hover:text-brand"
                      >
                        {cat.name} <ChevronRight className="h-3 w-3" />
                      </Link>
                      {cat.subcategories && cat.subcategories.length > 0 && (
                        <ul className="mt-1 ml-1 space-y-0.5">
                          {cat.subcategories.slice(0, 6).map((s: any) => (
                            <li key={s.id}>
                              <Link
                                to="/$state/$city/$category"
                                params={{ state, city, category: cat.slug }}
                                className="text-xs text-muted-foreground hover:text-brand hover:underline"
                              >
                                {s.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-sm text-muted-foreground">
          {recent.length} recent listing{recent.length === 1 ? "" : "s"} in {c.name}.{" "}
          <Link to="/post" className="font-semibold text-brand hover:underline inline-flex items-center gap-1">
            Post one <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}