import { hooks } from "@/lib/hooks/registry";
import { getPublicSupabase } from "@/lib/supabase-public.server";
import { manifest } from "./manifest";

// Server-side hook bindings for the blog plugin. Loaded only via
// bootstrap.server (dynamically imported inside server handlers), so nothing
// here reaches a client bundle.
export function registerServerHooks() {
  hooks.addFilter<string[], { origin: string }>(
    "sitemap.urls",
    async (urls, { origin }) => {
      const sb = getPublicSupabase();
      const { data } = await sb
        .from("blog_posts")
        .select("slug")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1000);
      return [...urls, `${origin}/blog`, ...(data ?? []).map((p) => `${origin}/blog/${p.slug}`)];
    },
    { module: manifest.slug },
  );
}
