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
        <p className="mt-2 text-muted-foreground">
          Most scams and bad meetups follow the same handful of patterns. If you follow the rules
          below, you'll avoid the vast majority of them.
        </p>

        <h2 className="mt-8 font-display text-xl font-semibold">Before you meet</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
          <li><strong>Message inside {BRAND.name} first.</strong> Keep a paper trail before sharing your phone number or email.</li>
          <li><strong>Search the listing photos.</strong> Reverse-image search the pictures — stolen photos are the #1 sign of a fake ad.</li>
          <li><strong>Ask a specific question.</strong> Real sellers answer details ("what's the VIN?", "does the fridge come with the apartment?"). Scammers dodge and pivot to payment.</li>
          <li><strong>Confirm the price in writing.</strong> If it "just went up" or "shipping was added", walk away.</li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-semibold">Meeting in person</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
          <li><strong>Meet in public, in daylight.</strong> Coffee shops, bank lobbies, or the police-station "safe exchange zones" many US cities offer.</li>
          <li><strong>Bring a friend.</strong> Non-negotiable for vehicles, furniture pickups, and apartment showings.</li>
          <li><strong>Tell someone where you're going.</strong> Share your location on your phone while you're there.</li>
          <li><strong>Inspect before you pay.</strong> Test electronics plugged in. Drive the car. Try the keys in the apartment lock.</li>
          <li><strong>Pay in person, in cash or a verified transfer.</strong> Count it in front of them or wait for the transfer to clear.</li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-semibold">Red flags — walk away</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
          <li><strong>"Wire the deposit and I'll ship it."</strong> Nobody legit asks for a wire, Zelle, Venmo, Cash App, or gift cards for an item you haven't seen.</li>
          <li><strong>"I'm out of state, my shipper will handle it."</strong> Classic vehicle scam. There is no shipper.</li>
          <li><strong>Overpayment + refund the difference.</strong> The check bounces days after you've sent the refund.</li>
          <li><strong>Pressure to move fast.</strong> "Other people are interested, decide now" is a manipulation, not a fact.</li>
          <li><strong>Requests for your ID, SSN, or bank login</strong> to "verify" you. Never share these to buy or sell a used item.</li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-semibold">Posting safely</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
          <li>Don't post your home address — use a neighborhood or nearest intersection.</li>
          <li>Blur license plates, house numbers, and any documents in photos.</li>
          <li>Prefer the in-app message thread over your personal phone number when you can.</li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-semibold">If something goes wrong</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          Use the <strong>Report</strong> button on any listing to send it straight to our moderation queue. If you've been
          the victim of fraud or a threat, contact your local police — and file a report with the FTC at{" "}
          <a href="https://reportfraud.ftc.gov" target="_blank" rel="noreferrer" className="text-brand font-medium">reportfraud.ftc.gov</a>{" "}
          or the FBI's IC3 at{" "}
          <a href="https://www.ic3.gov" target="_blank" rel="noreferrer" className="text-brand font-medium">ic3.gov</a>.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Spot a scam ad? <Link to="/" className="text-brand font-medium">Browse to the listing</Link> and hit Report — a moderator will review it.
        </p>
      </article>
      <SiteFooter />
    </div>
  ),
});