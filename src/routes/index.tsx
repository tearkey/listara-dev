import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, MapPin, Briefcase, Home, ShoppingBag, Wrench, Car, Users, Zap, Heart, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listFeaturedCities, listCategories, listStates } from "@/lib/catalog.functions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "shopping-bag": ShoppingBag, briefcase: Briefcase, home: Home, wrench: Wrench,
  car: Car, users: Users, zap: Zap, heart: Heart,
};

const featuredCitiesOpts = queryOptions({
  queryKey: ["featured-cities"],
  queryFn: () => listFeaturedCities(),
});
const categoriesOpts = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
});
const statesOpts = queryOptions({
  queryKey: ["states"],
  queryFn: () => listStates(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — ${BRAND.shortDesc}` },
      { name: "description", content: BRAND.tagline },
      { property: "og:title", content: `${BRAND.name} — Free local classifieds` },
      { property: "og:description", content: BRAND.tagline },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(featuredCitiesOpts),
      context.queryClient.ensureQueryData(categoriesOpts),
      context.queryClient.ensureQueryData(statesOpts),
    ]);
  },
  component: HomePage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-muted-foreground">Couldn't load home page: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function HomePage() {
  const { data: cities } = useSuspenseQuery(featuredCitiesOpts);
  const { data: categories } = useSuspenseQuery(categoriesOpts);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-secondary via-background to-accent/30">
        <div className="absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="absolute right-0 top-20 h-72 w-72 rounded-full bg-peach/40 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
              Now serving every US city
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight md:text-6xl">
              Your city, your <span className="text-brand">bulletin board</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
              {BRAND.tagline}
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate({ to: "/search", search: { q: q.trim() } }); }}
              className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-full border border-border bg-card p-2 shadow-sm"
            >
              <Search className="ml-3 h-5 w-5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search for anything in your city…"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button type="submit" className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90">Search</Button>
            </form>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Or post your own —</span>
              <Link to="/post" className="font-semibold text-brand hover:underline inline-flex items-center gap-1">
                Free to post <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured cities */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">Pick your city</h2>
            <p className="mt-1 text-sm text-muted-foreground">Browse listings tailored to where you are.</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {cities.map((c: any) => (
            <Link
              key={c.id}
              to="/$state/$city"
              params={{ state: c.states.slug, city: c.slug }}
              className="group rounded-2xl border border-border bg-card p-4 transition hover:border-brand hover:shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4 text-brand" />
                {c.states.code}
              </div>
              <div className="mt-1 font-display text-lg font-semibold group-hover:text-brand">{c.name}</div>
              {c.population && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {Intl.NumberFormat("en-US", { notation: "compact" }).format(c.population)} people
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="font-display text-2xl font-bold md:text-3xl">Browse by category</h2>
        <p className="mt-1 text-sm text-muted-foreground">Find what your neighbors are sharing right now.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {categories.map((cat: any) => {
            const Icon = ICONS[cat.icon ?? ""] ?? ShoppingBag;
            return (
              <div key={cat.id} className="group rounded-2xl border border-border bg-card p-5 transition hover:border-brand hover:shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-brand">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="mt-3 font-display text-lg font-semibold">{cat.name}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{cat.description}</p>
                <div className="mt-3 text-xs font-medium text-brand">
                  {cat.subcategories?.length ?? 0} subcategories
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="rounded-3xl border border-border bg-gradient-to-br from-brand/20 via-secondary to-accent/40 p-8 md:p-12">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold md:text-3xl">Got something to sell, rent, or share?</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Post in any city in under a minute. First post is free, always.
              </p>
            </div>
            <Button asChild size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/post">Post an ad <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
