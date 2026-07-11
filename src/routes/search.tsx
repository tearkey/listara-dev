import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdCard } from "@/components/ad-card";
import { searchAds } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";

const searchSchema = z.object({ q: z.string().catch("") });

export const Route = createFileRoute("/search")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ context, deps }) => {
    if (!deps.q) return { results: [] };
    const results = await context.queryClient.ensureQueryData(queryOptions({
      queryKey: ["search", deps.q],
      queryFn: () => searchAds({ data: { q: deps.q, limit: 50 } }),
    }));
    return { results };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Search — ${BRAND.name}` },
      { name: "description", content: `Search local classifieds on ${BRAND.name}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <div className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["search", q], queryFn: () => searchAds({ data: { q: q || " ", limit: 50 } }), enabled: !!q,
  }));
  const results = q ? (data ?? []) : [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold">
          {q ? <>Results for <span className="text-brand-strong">"{q}"</span></> : "Search Listara"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{q ? `${results.length} matching listing${results.length === 1 ? "" : "s"}` : "Try the search box above."}</p>
        {results.length === 0 && q && (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Nothing matches "{q}". Try a broader term or <Link to="/post" className="text-brand-strong font-semibold">post one yourself</Link>.
          </div>
        )}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {results.map((ad: any) => <AdCard key={ad.id} ad={ad} />)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}