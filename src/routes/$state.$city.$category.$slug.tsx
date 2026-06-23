import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Flag, MapPin, MessageCircle, Phone, Mail, Pin, Star, ArrowUp, Eye, Calendar, Hash, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { getAdByShortId, getAdContact } from "@/lib/catalog.functions";
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
  const getContactFn = useServerFn(getAdContact);
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState<{ contact_phone: string | null; contact_email: string | null } | null>(null);
  const [revealPhone, setRevealPhone] = useState(false);
  const [revealEmail, setRevealEmail] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);
  const images = (ad.ad_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .slice(0, 5);

  async function loadContact() {
    if (contact || loadingContact) return contact;
    if (!user) {
      toast.error("Sign in to view contact info");
      return null;
    }
    setLoadingContact(true);
    try {
      const c = await getContactFn({ data: { adId: ad.id } });
      setContact(c);
      return c;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setLoadingContact(false);
    }
  }

  async function handleRevealPhone() {
    const c = await loadContact();
    if (c?.contact_phone) setRevealPhone(true);
    else if (c) toast.info("No phone provided");
  }
  async function handleRevealEmail() {
    const c = await loadContact();
    if (c?.contact_email) setRevealEmail(true);
    else if (c) toast.info("No email provided");
  }

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

  const postedDate = ad.posted_at
    ? new Date(ad.posted_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";
  const neighborhood = ad.cities?.name ?? "—";

  // No client-side masking — public payload never includes the real values.

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <nav className="text-xs text-muted-foreground">
          <Link to="/">Home</Link> /{" "}
          <Link to="/$state/$city" params={{ state: ad.cities!.states!.slug, city: ad.cities!.slug }}>
            {ad.cities!.name}, {ad.cities!.states!.code}
          </Link> /{" "}
          <Link to="/$state/$city/$category" params={{ state: ad.cities!.states!.slug, city: ad.cities!.slug, category: ad.categories!.slug }}>
            {ad.categories!.name}
          </Link>
        </nav>

        <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            {/* Carousel — up to 5 photos */}
            <ImageCarousel images={images} title={ad.title} />

            {/* Title + price */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">{ad.title}</h1>
              {price && (
                <div className="rounded-xl bg-brand/15 px-4 py-2 text-2xl font-display font-bold text-foreground">
                  {price}
                </div>
              )}
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Hash className="h-4 w-4 text-brand" />
                <span className="font-medium text-foreground">Post ID:</span>{" "}
                <span className="font-mono uppercase">{ad.short_id}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-brand" />
                <span className="font-medium text-foreground">Posted:</span> {postedDate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand" />
                <span className="font-medium text-foreground">Neighborhood:</span> {neighborhood},{" "}
                {ad.cities!.states!.code}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-brand" />
                {ad.view_count ?? 0} views
              </span>
              {ad.tier !== "free" && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ad.tier === "sticky"
                      ? "bg-accent text-accent-foreground"
                      : ad.tier === "featured"
                        ? "bg-brand text-brand-foreground"
                        : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {ad.tier === "sticky" ? <Pin className="h-3 w-3" /> : ad.tier === "featured" ? <Star className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                  {ad.tier.charAt(0).toUpperCase() + ad.tier.slice(1)}
                </span>
              )}
            </div>

            {/* Description */}
            <article className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                {ad.body}
              </p>
            </article>

            <button
              onClick={handleReport}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Flag className="h-3 w-3" /> Report this ad
            </button>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* Contact Advertiser card */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-lg font-bold">Contact Advertiser</h2>
              <div className="mt-3 flex items-center gap-3">
                {ad.profiles?.avatar_url ? (
                  <img src={ad.profiles.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-secondary inline-flex items-center justify-center font-display font-bold text-muted-foreground">
                    {(ad.profiles?.display_name ?? "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-display font-semibold truncate">{ad.profiles?.display_name ?? "Poster"}</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-brand" />
                    Reputation: {ad.profiles?.reputation ?? 0}
                  </div>
                </div>
              </div>

              {/* Reveal-on-click contact — fetched only after sign-in. */}
              <div className="mt-4 space-y-2">
                {revealPhone && contact?.contact_phone ? (
                  <a
                    href={`tel:${contact.contact_phone}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-brand-foreground hover:bg-brand/90"
                  >
                    <Phone className="h-5 w-5" /> {contact.contact_phone}
                  </a>
                ) : (
                  <Button
                    type="button"
                    onClick={handleRevealPhone}
                    disabled={loadingContact}
                    className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
                    size="lg"
                  >
                    <Phone className="h-5 w-5 mr-1" />
                    {loadingContact ? "Loading…" : user ? "Show phone" : "Sign in to show phone"}
                  </Button>
                )}
                {revealEmail && contact?.contact_email ? (
                  <a
                    href={`mailto:${contact.contact_email}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/60 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    <Mail className="h-4 w-4" /> {contact.contact_email}
                  </a>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRevealEmail}
                    disabled={loadingContact}
                    className="w-full"
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    {loadingContact ? "Loading…" : user ? "Show email" : "Sign in to show email"}
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground text-center">
                  Contact info is hidden from anonymous viewers and revealed only after sign-in.
                </p>
              </div>

              {ad.allow_messages && (
                <form onSubmit={handleSend} className="mt-5 space-y-2 border-t border-border pt-4">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Or send a message
                  </label>
                  <Textarea
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder={user ? `Message about "${ad.title}"…` : "Sign in to message"}
                    rows={3}
                    disabled={!user}
                  />
                  <Button
                    type="submit"
                    disabled={!user || msg.trim().length === 0}
                    variant="outline"
                    className="w-full"
                  >
                    <MessageCircle className="h-4 w-4 mr-1" /> Send message
                  </Button>
                  {!user && (
                    <p className="text-xs text-muted-foreground text-center">
                      <Link to="/auth" className="text-brand font-medium">Sign in</Link> to message this poster
                    </p>
                  )}
                </form>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Safety tip:</strong> Meet in public, inspect before paying, and never wire money to strangers.{" "}
              <Link to="/safety" className="text-brand font-medium">More tips</Link>.
            </div>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function ImageCarousel({ images, title }: { images: Array<{ public_url: string; sort_order: number }>; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/40 text-muted-foreground">
        <ImageIcon className="h-10 w-10" />
      </div>
    );
  }
  if (images.length === 1) {
    return (
      <img
        src={images[0].public_url}
        alt={title}
        className="aspect-[16/10] w-full rounded-2xl border border-border object-cover"
      />
    );
  }
  return (
    <div>
      <Carousel className="relative" opts={{ loop: true }}>
        <CarouselContent>
          {images.map((img, i) => (
            <CarouselItem key={img.public_url}>
              <img
                src={img.public_url}
                alt={`${title} — photo ${i + 1}`}
                className="aspect-[16/10] w-full rounded-2xl border border-border object-cover"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-3" />
        <CarouselNext className="right-3" />
        <div className="absolute bottom-3 right-3 rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-medium text-background">
          {images.length} photos
        </div>
      </Carousel>
      <div className="mt-2 flex gap-2 overflow-x-auto">
        {images.map((img, i) => (
          <button
            key={img.public_url}
            type="button"
            onClick={() => setActive(i)}
            className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
              active === i ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            <img src={img.public_url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}