import { createFileRoute, Link } from "@tanstack/react-router";
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
      <main>
      <article className="prose mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-foreground/90">
        <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <p className="mt-4">
          This Privacy Policy explains what information {BRAND.name} collects, how we use it, who we share it with,
          and the choices you have. We collect only what we need to run a safe classifieds marketplace, and we do
          not sell your personal information.
        </p>

        <h2 className="mt-6 font-display text-xl font-semibold">1. Information we collect</h2>
        <ul className="list-disc pl-6">
          <li><strong>Account info</strong> — email address, display name, avatar, and (optionally) a verified phone number.</li>
          <li><strong>Listings you post</strong> — title, description, price, category, city, photos, and any contact details you choose to include.</li>
          <li><strong>Messages</strong> — the content of in-app messages you send other users, so we can deliver them and moderate abuse.</li>
          <li><strong>Payment info</strong> — when you buy a paid promotion, our payment processor (NOWPayments for crypto payments) collects payment details directly; we store only the invoice ID, amount, currency, and status.</li>
          <li><strong>Technical info</strong> — IP address, browser/user-agent, device type, referral URL, and pages visited, used to prevent abuse and to operate the site.</li>
          <li><strong>Cookies and local storage</strong> — for authentication, session persistence, and basic analytics.</li>
        </ul>

        <h2 className="mt-6 font-display text-xl font-semibold">2. How we use your information</h2>
        <ul className="list-disc pl-6">
          <li>Operate the Service: publish your listings, deliver your messages, process paid promotions.</li>
          <li>Enforce our <Link to="/terms" className="text-brand font-medium">Terms</Link>: detect fraud, spam, prohibited content, and repeat abusers.</li>
          <li>Communicate with you: transactional emails (account, payment receipts, moderation actions). We don't send marketing without your opt-in.</li>
          <li>Improve the Service: aggregate, non-identifying metrics on traffic and usage.</li>
          <li>Comply with law: respond to valid legal requests and cooperate with law enforcement where required.</li>
        </ul>

        <h2 className="mt-6 font-display text-xl font-semibold">3. What is public</h2>
        <p>Your listings, your display name, and any contact information you choose to include in a listing are
        <strong> public by design</strong> — they appear on the listing page, in search results, and in sitemaps
        indexed by search engines. Do not put information in a listing that you don't want the whole internet to see.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">4. Who we share information with</h2>
        <p>We share the minimum necessary information with:</p>
        <ul className="list-disc pl-6">
          <li><strong>Service providers</strong> we use to operate the site — hosting, database, email delivery, and the NOWPayments crypto payment processor. They are contractually bound to use your data only for the services they provide us.</li>
          <li><strong>Other users</strong>, when you initiate a message thread or post a public listing.</li>
          <li><strong>Law enforcement</strong>, in response to a valid subpoena, court order, or other legal process, or when we believe in good faith that disclosure is necessary to prevent imminent harm.</li>
        </ul>
        <p className="mt-2">We do <strong>not</strong> sell, rent, or trade your personal information to advertisers or data brokers.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">5. Data retention</h2>
        <p>We keep account data while your account is active. Listings are automatically deleted after their expiration
        period (or after 24 hours if unpaid). Messages are retained for a reasonable period to support moderation and
        dispute resolution. Payment records are retained as long as required for tax and accounting purposes.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">6. Security</h2>
        <p>We use encryption in transit (HTTPS), scoped row-level security on our database, and access controls on
        administrative tooling. No system is 100% secure, but we take reasonable steps to protect the data we hold.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">7. Your rights</h2>
        <p>Depending on where you live (GDPR / UK GDPR / CCPA / CPRA and similar laws), you may have the right to:</p>
        <ul className="list-disc pl-6">
          <li>Access the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Delete your account and associated data.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Port your data to another service.</li>
          <li>Opt out of "sale" or "sharing" of personal information (we don't sell or share, but the right exists).</li>
        </ul>
        <p className="mt-2">You can delete your listings anytime from the <strong>My Ads</strong> page. To exercise
        any other right, contact us through the support link in the footer.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">8. Children</h2>
        <p>{BRAND.name} is not directed at children under 18 and we do not knowingly collect data from them. If you
        believe a child has provided us data, contact us and we will delete it.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">9. International transfers</h2>
        <p>Our servers may be located in the United States or other countries. By using {BRAND.name} you consent to
        your information being processed in those jurisdictions, which may have different data-protection laws than
        your own.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">10. Changes to this policy</h2>
        <p>We may update this Privacy Policy from time to time. Material changes will be posted here with a new
        "Last updated" date. Continued use of the Service after changes take effect constitutes acceptance.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">11. Contact</h2>
        <p>For privacy questions or requests, use the support link in the footer.</p>

        <p className="mt-6 text-muted-foreground">
          This policy is a general template. Have it reviewed by a privacy attorney licensed in your jurisdiction
          before you rely on it for a live commercial service, especially if you serve users in the EU, UK, or California.
        </p>
      </article>
      </main>
      <SiteFooter />
    </div>
  ),
});