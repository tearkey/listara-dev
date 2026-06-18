import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: `Safety tips — ${BRAND.name}` },
      { name: "description", content: `Stay safe when buying, selling, and meeting locally on ${BRAND.name}.` },
      { property: "og:title", content: `Safety tips — ${BRAND.name}` },
      { property: "og:description", content: "Practical safety rules for buyers, sellers, and posters." },
    ],
  }),
  component: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <article className="prose mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold">Safety tips</h1>
        <p className="mt-2 text-muted-foreground">A few rules that prevent almost every scam and bad meetup.</p>
        <ul className="mt-6 space-y-3 text-sm leading-relaxed text-foreground/90">
          <li><strong>Meet in public.</strong> Coffee shops, police-station "safe exchange zones", busy parking lots.</li>
          <li><strong>Pay in person.</strong> Never wire money, never send gift cards, never pay before seeing an item.</li>
          <li><strong>Bring a friend.</strong> Especially for vehicles, furniture pickups, or apartment showings.</li>
          <li><strong>Trust your gut.</strong> Vague replies, pressure to move fast, "I'll send a shipper" — scam tells.</li>
          <li><strong>Use the in-app message.</strong> Keep records before sharing your phone or email.</li>
          <li><strong>Report bad actors.</strong> The flag button on every ad goes straight to our moderators.</li>
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Spot something off? <Link to="/" className="text-brand font-medium">Flag the ad</Link> and we'll take a look.
        </p>
      </article>
      <SiteFooter />
    </div>
  ),
});