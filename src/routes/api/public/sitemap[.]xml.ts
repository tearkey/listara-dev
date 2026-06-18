import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/supabase-public.server";

function escape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" } as Record<string, string>)[c]);
}

export const Route = createFileRoute("/api/public/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const sb = getPublicSupabase();
        const [{ data: cities }, { data: categories }, { data: ads }] = await Promise.all([
          sb.from("cities").select("slug,states(slug)").eq("is_featured", true),
          sb.from("categories").select("slug"),
          sb.from("ads").select("short_id,slug,cities(slug,states(slug)),categories(slug)").eq("status", "live").limit(5000),
        ]);
        const urls: string[] = [`${origin}/`];
        for (const c of cities ?? []) {
          const stSlug = (c.states as any)?.slug;
          if (!stSlug) continue;
          urls.push(`${origin}/${stSlug}/${c.slug}`);
          for (const cat of categories ?? []) urls.push(`${origin}/${stSlug}/${c.slug}/${cat.slug}`);
        }
        for (const ad of ads ?? []) {
          const cs = (ad.cities as any)?.states?.slug;
          const ci = (ad.cities as any)?.slug;
          const ca = (ad.categories as any)?.slug;
          if (cs && ci && ca) urls.push(`${origin}/${cs}/${ci}/${ca}/${ad.slug}-${ad.short_id}`);
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${escape(u)}</loc></url>`).join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});