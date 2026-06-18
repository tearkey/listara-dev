
# Classifieds platform — build plan

## Important guardrails (read first)

You picked **classifieds + adult section, strict compliance**. Before writing code, you need to know what I will and won't build, because this directly affects whether the project is viable:

- **What I will not build:** ads that solicit or facilitate prostitution, escort services, or any commercial sexual activity. US law (FOSTA-SESTA, 18 U.S.C. §2421A) is what put the original Backpage operators in federal prison. Any "adult" section will be limited to **dating / casual encounters / companionship-with-no-exchange-of-money** with explicit policy banning solicitation, plus age-gate, ID verification hook, automated keyword filters, and human moderation queue.
- **Payments reality:** Stripe, Paddle, PayPal, and every mainstream processor prohibit adult content. If the adult section ships, you'll need a **high-risk processor** (CCBill, Segpay, Epoch, Verotel) and you must apply with them directly — I cannot provision those. Plan: ship the general-classifieds payments on Stripe (Lovable's built-in) for everything **except** the adult category, and leave a pluggable payment adapter for a high-risk processor you onboard yourself.
- **Ranking algorithm & backlinks of starbackpage.com:** these aren't copyable. Their algorithm is private, and their backlink profile was earned (or spammed) over time. I'll implement a transparent ranking score and we can analyze their backlink profile with Semrush so you know what link-building to pursue — but expecting to "inherit" their SEO is unrealistic.
- **Hosting note:** some hosts (including Cloudflare's free tier ToS) restrict adult content. You may need to move the adult subdomain to an adult-friendly host later. The Lovable preview and published site are fine for the general classifieds.

If any of the above is a dealbreaker, tell me now and I'll re-plan.

---

## Phase 1 — Foundation (general classifieds, US by city)

**Auth & accounts**
- Lovable Cloud + Google sign-in (via the managed Lovable broker).
- `profiles` table (display name, avatar, city, created_at) auto-created via trigger on `auth.users`.
- Separate `user_roles` table + `has_role()` SECURITY DEFINER (admin / moderator / user) — never store role on profile.
- Optional phone verification for posters (anti-spam); SMS via Twilio connector when you're ready.

**Taxonomy & geography**
- Seed ~50 US states + ~400 major cities (`states`, `cities` tables).
- Categories: Jobs, Housing, For Sale, Services, Community, Vehicles, Personals (SFW), plus the adult subcategory (Phase 3, gated).
- Each city × category gets its own indexable route: `/{state}/{city}/{category}`.

**Ads (core entity)**
- `ads` table: title, body, price, currency, city_id, category_id, subcategory_id, user_id, status (draft / pending / live / expired / removed), tier (free / bumped / featured / sticky), expires_at, view_count, contact preferences (email relay, in-app message, phone-optional).
- `ad_images` table + Supabase Storage bucket with size/format limits, EXIF stripping, and NSFW image scan hook (Phase 3).
- Posting flow: create draft → moderation rules → publish → auto-expire after 30 days (configurable).

**Browse / search**
- Home: city picker, then category grid.
- Category page: filtered, sorted by ranking score (below), with paid tiers pinned.
- Full-text search via Postgres `tsvector` + GIN index on title/body.
- Filters: price range, date posted, has-image, distance (later, when we add lat/lng).

**Ranking score (transparent, server-computed)**
```
score = (tier_weight)            # sticky=1000, featured=500, bumped=100, free=0
      + recency_decay(posted_at) # exponential decay over 7 days
      + 0.05 * log(view_count+1)
      + quality_bonus            # has_image, verified_user, completed_profile
      - spam_penalty             # reports, low-rep poster
```
Stored as a generated/triggered column so list queries stay fast.

**Public pages & SEO**
- Each ad: SSR route at `/{state}/{city}/{category}/{slug}-{shortId}` with `head()` setting title, meta description, OG image (first ad image), JSON-LD `Classified`/`Product`.
- City and category landing pages with unique copy per city.
- `sitemap.xml` server route, paginated, regenerated nightly.
- `robots.txt`, canonical tags, structured breadcrumbs.

---

## Phase 2 — Monetization & trust

**Payments (Stripe, Lovable built-in)**
- Enable seamless Stripe Payments. Tax handling default: full compliance (managed_payments) for digital "promotion" purchases.
- Product catalog: Bump ($X, re-tops listing once), Featured ($Y, 7 days highlighted), Sticky ($Z, 7 days pinned to top), Top-of-category package, Paid post in premium categories (Jobs, Services).
- Stripe Checkout → webhook (`/api/public/webhooks/stripe`) verifies signature → upgrades ad tier + sets expiry → server-fn revalidates listing.
- Receipts emailed via Resend connector.

**Moderation**
- `reports` table; any signed-in user can report an ad with reason.
- Admin/moderator dashboard at `/_authenticated/admin`: queue of pending ads, reported ads, banned-keyword hits, quick approve/remove/ban-user actions.
- Banned-words list (config table) — automatic hold for review.
- Rate limits per user/IP on posting and reporting.
- Audit log of moderator actions.

**Anti-spam & abuse**
- hCaptcha on posting + signup.
- Email verification required to post.
- Image hashing (pHash) to detect duplicate listings across accounts.
- Per-account daily post quota; higher quotas for verified phone.

---

## Phase 3 — Adult section (compliance-first, optional)

Only build this once Phase 1–2 are stable and you confirm. This is the gating logic; **the section will not host solicitation ads**:

- Separate subdomain or `/adult/...` path, age-gate modal (18+/21+ where required), persistent cookie.
- Mandatory ID verification before first post — integrate Stripe Identity or Persona (you provide the account/key).
- Strict category list (dating, casual, companionship without exchange-of-money). No "rates", "donations", "roses" code language — keyword list auto-rejects.
- All posts go to **human moderation queue** before going live, no exceptions.
- Image moderation: Sightengine or AWS Rekognition (your key) to flag nudity/CSAM signals; CSAM hits → immediate block + NCMEC reporting workflow stub.
- Adult section uses a **separate payment adapter** (interface defined now, you wire the high-risk processor later).
- DMCA + 2257-compliance contact pages.

If you want me to skip Phase 3 entirely and ship the general classifieds (much faster, much lower risk), say so.

---

## Phase 4 — Growth & SEO (the "ranking & backlinks" question)

- Programmatic SEO: every city × category combo is a real indexable page with unique H1, intro copy, latest ads, and FAQs.
- JSON-LD on ad pages, breadcrumb schema, OG/Twitter cards from first image.
- Sitemap split by city; ping search engines on regeneration.
- Once live, I can run a Semrush competitive analysis on starbackpage.com to surface their top organic keywords, top pages, and referring domains — then we target the same keywords and pursue similar referring-domain categories (local directories, niche forums, press). You'll need the Semrush connector linked.
- Backlinks are earned, not cloned: directory submissions, city-specific PR, partnerships with local blogs.

---

## Technical details

**Stack:** TanStack Start (already scaffolded) + Lovable Cloud (Supabase) + Stripe payments + Resend (email) + optional Twilio (SMS), Sightengine/Persona (Phase 3).

**Key tables (Phase 1):** `profiles`, `user_roles`, `states`, `cities`, `categories`, `subcategories`, `ads`, `ad_images`, `ad_tiers_history`, `messages` (in-app contact), `reports`, `audit_log`, `payments`, `banned_keywords`.

**RLS:** every table on, policies scoped to `auth.uid()` for owner writes; public SELECT on `ads` only where `status = 'live'`; moderation tables restricted via `has_role()`.

**Server functions:** `createAd`, `updateAd`, `publishAd`, `bumpAd`, `reportAd`, `searchAds` (public read uses publishable-key client + narrow anon SELECT policy so SSR/SEO works without auth).

**Public webhooks (server routes under `/api/public/`):** Stripe webhook, sitemap, optional high-risk-processor webhook.

**Image pipeline:** client resize → upload to Storage → server fn strips EXIF, generates 3 sizes, stores URLs on `ad_images`.

**Migrations:** every `CREATE TABLE` in `public` includes explicit `GRANT`s for `authenticated` / `service_role` (and `anon` SELECT only where the policy allows it).

---

## What I need from you to start

1. Confirm: **ship Phase 1 + 2 first**, then decide on Phase 3 (adult). Yes/no.
2. Confirm the brand name for the platform (not "Starbackpage" — copying the name invites legal trouble).
3. A 1–2 sentence positioning line for the homepage (so SEO/meta isn't generic).
4. Logo / color preference, or I can propose a direction.
5. Optional now, required before Phase 3: which ID-verification + image-moderation vendor you want to use.

Approve this plan and I'll start with Phase 1: enable Lovable Cloud, scaffold auth + Google sign-in, taxonomy, ad CRUD, and the city/category routes with SEO.
