import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${BRAND.name}` },
      { name: "description", content: `Terms of Service for ${BRAND.name}.` },
    ],
  }),
  component: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <article className="prose mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-foreground/90">
        <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        <h2 className="mt-6 font-display text-xl font-semibold">1. Posting rules</h2>
        <p>By posting on {BRAND.name} you agree not to post:</p>
        <ul className="list-disc pl-6">
          <li>Solicitation of prostitution, escort, or commercial sexual services</li>
          <li>Sales of firearms or controlled substances to civilians</li>
          <li>Counterfeit goods, stolen property, or scams</li>
          <li>Hate speech, harassment, or content involving minors</li>
          <li>Spam, duplicate listings, or misleading content</li>
        </ul>
        <h2 className="mt-6 font-display text-xl font-semibold">2. Account responsibility</h2>
        <p>You're responsible for your account, the content you post, and any communications you make through {BRAND.name}.</p>
        <h2 className="mt-6 font-display text-xl font-semibold">3. We host, we don't sell</h2>
        <p>{BRAND.name} is a platform for users to publish their own ads. We don't endorse listings and aren't party to any transaction. Always meet, inspect, and pay in person.</p>
        <h2 className="mt-6 font-display text-xl font-semibold">4. Moderation</h2>
        <p>We may remove any ad and ban any account that violates these rules. Repeat offenders are permanently blocked.</p>
        <p className="mt-6 text-muted-foreground">Starter template — replace with terms reviewed by counsel before launch.</p>
      </article>
      <SiteFooter />
    </div>
  ),
});