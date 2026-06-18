import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Flag, MapPin, MessageCircle, Phone, Mail, Pin, Star, ArrowUp } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAdByShortId } from "@/lib/catalog.functions";
import { reportAd, sendMessage } from "@/lib/ads.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/$state/$city/$category/$slug")({
  loader: async ({ context, params }) => {
    // slug pattern: "{slug}-{shortId}" — shortId is 8 hex chars at end
    const slugFull = params.slug;
    const shortId = slugFull.slice(-8);
    const ad = await context.queryClient.ensureQueryData(queryOptions({
      queryKey: ["ad", shortId],
      queryFn: () => getAdByShortId({ data: { shortId } }),
    }));
    if (!ad) throw notFound();
    return { ad, shortId };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] };
    const { ad } = loaderData;
    const img = (ad.ad_images ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.public_url;
    const title = `${ad.title} — ${ad.cities?.name}, ${ad.cities?.states?.code} | ${BRAND.name}`;
    const desc = (ad.body ?? "").slice(0, 160);
    return {
      meta: [
        { title }, { name: "description", content: desc },
        { property: "og:title", content: ad.title }, { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
      ],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: ad.title,
          description: desc,
          image: img,
          offers: ad.price_cents != null ? {
            "@type": "Offer",
            priceCurrency: ad.currency ?? "USD",
            price: (ad.price_cents / 100).toFixed(2),
            availability: "https://schema.org/InStock",
          } : undefined,
        }),
      }],
    };
  },
  errorComponent: ({ error }) => <div className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Ad not found or no longer available.</div>,
  component: AdDetailPage,
});

function AdDetailPage() {
  const { ad } = Route.useLoaderData();
  const { user } = useAuth();
  const reportFn = useServerFn(reportAd);
  const sendFn = useServerFn(sendMessage);
  const [msg, setMsg] = useState("");
  const images = (ad.ad_images ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);

  async function handleReport() {
    const reason = window.prompt("Why are you reporting this ad?");
    if (!reason) return;
    if (!user) return toast.error("Sign in to report ads");
    try {
      await reportFn({ data: { ad_id: ad.id, reason } });
      toast.success("Thanks — our moderators will review.");
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return toast.error("Sign in to send a message");
    try {
      await sendFn({ data: { ad_id: ad.id, body: msg } });
      toast.success("Message sent");
      setMsg("");
    } catch (e: any) { toast.error(e.message); }
  }

  const price = ad.price_cents != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: ad.currency ?? "USD" }).format(ad.price_cents / 100) : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <nav className="text-xs text-muted-foreground">
          <Link to="/">Home</Link> /{" "}
          <Link to="/$state/$city" params={{ state: ad.cities!.states!.slug, city: ad.cities!.slug }}>
            {ad.cities!.name}, {ad.cities!.states!.code}
          </Link> /{" "}
          <Link to="/$state/$city/$category" params={{ state: ad.cities!.states!.slug, city: ad.cities!.slug, category: ad.categories!.slug }}>
            {ad.categories!.name}
          </Link>
        </nav>

        <div className="mt-3 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-bold leading-tight">{ad.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {ad.cities!.name}, {ad.cities!.states!.code} · {ad.categories!.name}
                </p>
              </div>
              {price && <div className="rounded-xl bg-brand/15 px-4 py-2 text-2xl font-display font-bold text-foreground">{price}</div>}
            </div>

            {ad.tier !== "free" && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ad.tier === "sticky" ? "bg-accent text-accent-foreground" : ad.tier === "featured" ? "bg-brand text-brand-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {ad.tier === "sticky" ? <Pin className="h-3 w-3" /> : ad.tier === "featured" ? <Star className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                {ad.tier.charAt(0).toUpperCase() + ad.tier.slice(1)}
              </span>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((img: any) => (
                  <img key={img.public_url} src={img.public_url} alt="" className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{ad.body}</p>
            </div>

            <button onClick={handleReport} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Flag className="h-3 w-3" /> Report this ad
            </button>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                {ad.profiles?.avatar_url ? (
                  <img src={ad.profiles.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-secondary inline-flex items-center justify-center font-display font-bold text-muted-foreground">
                    {(ad.profiles?.display_name ?? "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-display font-semibold">{ad.profiles?.display_name ?? "Poster"}</div>
                  <div className="text-xs text-muted-foreground">Reputation: {ad.profiles?.reputation ?? 0}</div>
                </div>
              </div>

              {ad.allow_messages && (
                <form onSubmit={handleSend} className="mt-4 space-y-2">
                  <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={user ? `Message about "${ad.title}"…` : "Sign in to message"} rows={3} disabled={!user} />
                  <Button type="submit" disabled={!user || msg.trim().length === 0} className="w-full bg-brand text-brand-foreground hover:bg-brand/90">
                    <MessageCircle className="h-4 w-4 mr-1" /> Send message
                  </Button>
                  {!user && (
                    <p className="text-xs text-muted-foreground text-center">
                      <Link to="/auth" className="text-brand font-medium">Sign in</Link> to message this poster
                    </p>
                  )}
                </form>
              )}

              {(ad.contact_email || ad.contact_phone) && (
                <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  {ad.contact_email && (
                    <a href={`mailto:${ad.contact_email}`} className="flex items-center gap-2 text-foreground hover:text-brand">
                      <Mail className="h-4 w-4" /> {ad.contact_email}
                    </a>
                  )}
                  {ad.contact_phone && (
                    <a href={`tel:${ad.contact_phone}`} className="flex items-center gap-2 text-foreground hover:text-brand">
                      <Phone className="h-4 w-4" /> {ad.contact_phone}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Safety tip:</strong> Meet in public, inspect before paying, and never wire money to strangers. <Link to="/safety" className="text-brand font-medium">More tips</Link>.
            </div>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}