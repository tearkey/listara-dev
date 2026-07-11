import { createFileRoute, Link } from "@tanstack/react-router";
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
      <main>
      <article className="prose mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-foreground/90">
        <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <p className="mt-4">
          Welcome to {BRAND.name}. These Terms of Service ("Terms") govern your access to and use of our website,
          services, and any related applications (collectively, the "Service"). By creating an account, posting a
          listing, or otherwise using the Service you agree to be bound by these Terms. If you don't agree, don't use the Service.
        </p>

        <h2 className="mt-6 font-display text-xl font-semibold">1. Eligibility</h2>
        <p>You must be at least 18 years old and legally able to form a binding contract to use {BRAND.name}. You agree
        to provide accurate account information and to keep your login credentials confidential. You are responsible
        for all activity on your account.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">2. Posting rules</h2>
        <p>{BRAND.name} is a general classifieds platform for lawful transactions between adults. You agree not to post,
        upload, or transmit content that:</p>
        <ul className="list-disc pl-6">
          <li>Solicits or facilitates prostitution, escort services, or any commercial sexual activity (prohibited under 18 U.S.C. §2421A / FOSTA-SESTA).</li>
          <li>Offers firearms, ammunition, explosives, or controlled substances to the general public.</li>
          <li>Involves stolen property, counterfeit goods, endangered species, or human remains.</li>
          <li>Depicts, exploits, or endangers minors in any way. CSAM is reported immediately to NCMEC and law enforcement.</li>
          <li>Contains hate speech, harassment, threats, or targeted abuse.</li>
          <li>Constitutes spam, duplicate postings, deceptive pricing, or fraudulent offers.</li>
          <li>Infringes on any third party's copyright, trademark, privacy, or publicity rights.</li>
          <li>Contains malware, phishing links, or attempts to circumvent our security or moderation systems.</li>
        </ul>

        <h2 className="mt-6 font-display text-xl font-semibold">3. Your content</h2>
        <p>You retain ownership of the content you post. By posting, you grant {BRAND.name} a worldwide, non-exclusive,
        royalty-free license to host, display, reproduce, and distribute that content for the purpose of operating and
        promoting the Service. You represent that you have the rights to grant that license.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">4. Marketplace disclaimer</h2>
        <p>{BRAND.name} is a venue. We do not own, inspect, endorse, guarantee, or take part in any transaction between
        users. All meetings, inspections, negotiations, and payments happen between the parties directly. You use the
        Service and interact with other users at your own risk. See our <Link to="/safety" className="text-brand-strong font-medium">Safety tips</Link>.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">5. Paid promotions</h2>
        <p>You may pay to bump, feature, or sticky a listing. Fees are quoted at checkout and payable in the currencies
        we support. Promotion fees are <strong>non-refundable</strong> once the promotion has started, except where
        required by law. Removing a listing that violates these Terms does not entitle you to a refund.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">6. Moderation and enforcement</h2>
        <p>We may, at our sole discretion and without prior notice, remove any listing, suspend or terminate any
        account, and cooperate with law enforcement in connection with any actual or suspected violation of these
        Terms or applicable law. Repeated violations result in a permanent ban.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">7. Prohibited use of the Service</h2>
        <ul className="list-disc pl-6">
          <li>Scraping, crawling, or bulk-downloading listings without written permission.</li>
          <li>Automating account creation, posting, messaging, or reporting.</li>
          <li>Attempting to breach security, probe vulnerabilities, or interfere with other users.</li>
          <li>Reselling, sublicensing, or commercializing access to the Service.</li>
        </ul>

        <h2 className="mt-6 font-display text-xl font-semibold">8. Disclaimers</h2>
        <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
        IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        We do not warrant that listings are accurate, that sellers or buyers are who they claim to be, or that the
        Service will be uninterrupted or error-free.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">9. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, {BRAND.name}, its officers, employees, and affiliates will not be
        liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits,
        revenues, data, or goodwill arising out of or related to your use of the Service. Our total aggregate
        liability for any claim arising out of these Terms is limited to the greater of USD $100 or the amount you
        paid us in the 12 months before the claim.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">10. Indemnification</h2>
        <p>You agree to indemnify and hold {BRAND.name} harmless from any claim, demand, damages, or expenses
        (including reasonable attorneys' fees) arising out of your content, your use of the Service, or your violation
        of these Terms or any law.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">11. DMCA</h2>
        <p>If you believe content on {BRAND.name} infringes your copyright, send a DMCA notice with the required
        information (identification of the work, the infringing URL, your contact info, a good-faith statement, and
        a signature) to our designated agent. Repeat infringers are terminated.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">12. Termination</h2>
        <p>You may stop using {BRAND.name} at any time and delete your listings from the My Ads page. We may suspend
        or terminate your access at any time for violation of these Terms.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">13. Changes to these Terms</h2>
        <p>We may update these Terms from time to time. Material changes will be posted here with an updated "Last
        updated" date. Continued use of the Service after changes take effect constitutes acceptance.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">14. Governing law</h2>
        <p>These Terms are governed by the laws of the United States and the state in which {BRAND.name} is
        headquartered, without regard to conflict-of-laws principles. Any dispute will be resolved in the state or
        federal courts located there, and you consent to their exclusive jurisdiction and venue.</p>

        <h2 className="mt-6 font-display text-xl font-semibold">15. Contact</h2>
        <p>Questions about these Terms? Contact us through the support link in the footer.</p>

        <p className="mt-6 text-muted-foreground">
          These Terms are a general template. Have them reviewed by an attorney licensed in your jurisdiction before
          you rely on them for a live commercial service.
        </p>
      </article>
      </main>
      <SiteFooter />
    </div>
  ),
});