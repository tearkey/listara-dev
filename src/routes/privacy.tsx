import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${BRAND.name}` },
      { name: "description", content: `How ${BRAND.name} handles your data.` },
    ],
  }),
  component: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <article className="prose mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-foreground/90">
        <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        <p className="mt-4">{BRAND.name} stores only what's needed to run the site: your email, your display name, the ads you post, and messages you send. We don't sell your data. Contact info you include in an ad is visible publicly on that ad — leave it out if you'd rather not.</p>
        <p className="mt-4">You can delete your ads anytime from My Ads. To delete your account entirely, contact us. Starter policy — replace with one reviewed by counsel before launch.</p>
      </article>
      <SiteFooter />
    </div>
  ),
});