import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPostBySlug } from "@/modules/blog/blog.functions";
import { Markdown } from "@/lib/markdown";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ context, params }) => {
    let post;
    try {
      post = await context.queryClient.ensureQueryData(
        queryOptions({
          queryKey: ["blog", "post", params.slug],
          queryFn: () => getPostBySlug({ data: { slug: params.slug } }),
          staleTime: 60_000,
        }),
      );
    } catch (e: any) {
      if (String(e?.message).includes("BLOG_DISABLED")) throw notFound();
      throw e;
    }
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] };
    const { post } = loaderData;
    const title = `${post.seo_title || post.title} | ${BRAND.name}`;
    const desc = post.meta_description || post.excerpt || (post.body_markdown ?? "").slice(0, 160);
    const img = post.og_image || post.cover_image || undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: post.seo_title || post.title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
      ],
      links: post.canonical_url ? [{ rel: "canonical", href: post.canonical_url }] : [],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: desc,
            image: img,
            datePublished: post.published_at,
            author: { "@type": "Organization", name: BRAND.name },
            publisher: { "@type": "Organization", name: BRAND.name },
          }),
        },
      ],
    };
  },
  notFoundComponent: () => <div className="p-8">Article not found.</div>,
  component: BlogPostPage,
});

function BlogPostPage() {
  const { post } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight">{post.title}</h1>
        {post.published_at && (
          <div className="mt-3 text-sm text-muted-foreground">
            {new Date(post.published_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        )}
        {post.cover_image && (
          <img src={post.cover_image} alt="" className="mt-6 w-full rounded-2xl object-cover" />
        )}
        <div className="mt-6 text-base text-foreground/90">
          <Markdown source={post.body_markdown ?? ""} />
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}
