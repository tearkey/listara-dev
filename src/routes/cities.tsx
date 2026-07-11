import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listAllCitiesGrouped } from "@/lib/catalog.functions";

const opts = queryOptions({
  queryKey: ["cities", "all-grouped"],
  queryFn: () => listAllCitiesGrouped(),
});

export const Route = createFileRoute("/cities")({
  head: () => ({
    meta: [
      { title: `Browse all cities — ${BRAND.name}` },
      { name: "description", content: `All US cities with active listings on ${BRAND.name}, grouped by state.` },
      { property: "og:title", content: `Browse all cities — ${BRAND.name}` },
      { property: "og:description", content: `Find local classifieds in every US city on ${BRAND.name}.` },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-muted-foreground">Couldn't load cities: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: CitiesPage,
});

function CitiesPage() {
  const { data: groups } = useSuspenseQuery(opts);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 max-w-2xl">
          <h1 className="font-display text-3xl font-bold md:text-4xl">All cities</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick your city to see local listings. {groups.reduce((n, g) => n + g.cities.length, 0)} cities across {groups.length} states.
          </p>
        </header>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No cities available yet.
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.slug}>
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-mono text-muted-foreground">{g.code}</span>
                  {g.name}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {g.cities.map((c: any) => (
                    <Link
                      key={c.id}
                      to="/$state/$city"
                      params={{ state: g.slug, city: c.slug }}
                      className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-brand hover:text-brand"
                    >
                      <MapPin className="h-3.5 w-3.5 text-brand" />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}