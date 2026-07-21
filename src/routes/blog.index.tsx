import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listPublishedPosts } from "@/modules/blog/blog.functions";
import { BRAND } from "@/lib/brand";

const postsOpts = queryOptions({
  queryKey: ["blog", "list"],
  queryFn: () => listPublishedPosts({ data: {} }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/blog/")({
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(postsOpts);
    } catch (e: any) {
      // Blog plugin deactivated → the section simply doesn't exist.
      if (String(e?.message).includes("BLOG_DISABLED")) throw notFound();
      throw e;
    }
  },
  head: () => ({
    meta: [
      { title: `Blog — safety guides & local tips | ${BRAND.name}` },
      {
        name: "description",
        content: `Safety guides, scam-avoidance tips, and local resources from ${BRAND.name}.`,
      },
      { property: "og:title", content: `${BRAND.name} Blog` },
    ],
  }),
  notFoundComponent: () => <div className="p-8">This page is not available.</div>,
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const { posts } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-brand" />
          <h1 className="font-display text-3xl font-bold">Blog</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Safety guides, scam-avoidance tips, and local resources.
        </p>

        {posts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No articles yet — check back soon.
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {posts.map((p: any) => (
              <Link
                key={p.id}
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-brand/50"
              >
                {p.cover_image && (
                  <img
                    src={p.cover_image}
                    alt=""
                    loading="lazy"
                    className="h-48 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <h2 className="font-display text-xl font-bold group-hover:text-brand">
                    {p.title}
                  </h2>
                  {p.excerpt && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                  )}
                  {p.published_at && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Date(p.published_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
