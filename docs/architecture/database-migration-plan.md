# Moving off Supabase to a self-hosted database (planning note)

> Status: **planning only — not started.** Captured per request so we can pick it
> up later. Nothing in this document has been implemented.

The app currently runs on Supabase (project `tolamikjclfpeglmlivr`). The goal is
to run our own database server on a hosting provider of our choice. This note
records what that migration actually involves so we don't underestimate it.

## What "Supabase" is doing for us today

Supabase is not just a Postgres database. The app leans on several Supabase
sub-systems, and each one needs a replacement or a decision to drop it:

| Supabase feature | Where it's used | Replacement needed |
| --- | --- | --- |
| **Postgres database** | everything | Any managed/self-hosted Postgres 15+ (RDS, Cloud SQL, Neon, Railway, Fly, a VPS, etc.) |
| **Row Level Security (RLS)** | every table policy in `supabase/migrations/` | Ships with Postgres — keep the policies, but see auth note below |
| **Auth (`auth.users`, JWT, `auth.uid()`)** | `requireSupabaseAuth`, all `user_id` FKs, every RLS policy | The hardest part. Need a replacement identity provider and a way to keep `auth.uid()` working in policies |
| **GoTrue MFA / `aal2` claims** | `dashboard.mfa.tsx`, superadmin gate | Replacement must issue AAL/MFA claims or we rebuild that gate |
| **PostgREST (the auto REST API)** | every `supabase.from(...)` call in the client and server fns | Biggest code change — see below |
| **Storage / `ad_images.public_url`** | ad photos | Move to S3/R2/Cloudflare Images or keep a separate bucket |
| **`pg_cron` scheduled jobs** | `moderation_auto_takedown`, `expire_stale_ads`, `purge_abandoned_drafts` | Self-hosted Postgres needs the `pg_cron` extension, or move these to an external scheduler |
| **Service-role key / admin client** | `client.server.ts` (`supabaseAdmin`) | Replace with a privileged DB connection |

## The two big work items

### 1. Auth is the critical-path dependency
Nearly every RLS policy calls `auth.uid()` and `public.has_role(auth.uid(), …)`,
and `user_id` columns are FKs to `auth.users`. Options, roughly in order of effort:

- **Keep Supabase Auth only, self-host just the DB** — smallest change, but not a
  clean break from Supabase.
- **Self-host GoTrue** (Supabase's auth server is open source) against our own
  Postgres — preserves `auth.uid()`/JWT shape so RLS and middleware barely change.
  Recommended first target.
- **Swap to a different provider** (Auth0, Clerk, Cognito, custom) — largest
  change: we'd re-implement the `auth` schema shim, re-issue JWTs our middleware
  understands, and re-point every FK.

### 2. Data access layer (PostgREST)
The code talks to the DB through Supabase's PostgREST client
(`supabase.from("ads").select(...)`). Without Supabase there's no PostgREST unless
we run it ourselves. Two paths:

- **Run PostgREST ourselves** next to our Postgres — keeps the `supabase-js`
  calls working almost unchanged (just new URL + keys). Lowest code churn.
- **Replace the data layer** with a server-side query builder / ORM (Drizzle,
  Kysely, Prisma) and turn every `*.functions.ts` server fn into direct SQL.
  More work, but removes the Supabase client entirely and is the true "own stack".

## Suggested phased approach (least risky)

1. **Stand up own Postgres**, restore schema from `supabase/migrations/` +
   a `pg_dump` of data. Verify all extensions exist (`pg_cron`, `pgcrypto`,
   `uuid-ossp`, full-text search).
2. **Self-host GoTrue + PostgREST** pointed at the new DB. At this stage the app
   only changes its env vars (`SUPABASE_URL`, keys) — no code rewrite. This gets
   us off Supabase's hosting while keeping the code shape.
3. **Migrate storage** for `ad_images` to the new object store; backfill URLs.
4. **Cut over cron jobs** (confirm `pg_cron` or move to an external scheduler).
5. *(Optional, later)* Replace `supabase-js` with a direct SQL layer to drop the
   PostgREST/GoTrue dependency entirely.

## Before we start — open questions to confirm
- Which hosting provider / managed Postgres are we targeting?
- Do we keep JWT-based auth (self-hosted GoTrue) or move to a new IdP?
- Is running PostgREST acceptable, or do we want a full ORM rewrite now?
- Where do ad images live post-migration, and how do we backfill existing URLs?
- Data-migration cutover: acceptable downtime window vs. dual-write/replication?

## Files that hardcode the Supabase assumption (change surface)
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`,
  `auth-attacher.ts`
- `src/lib/supabase-public.server.ts`
- Every `src/lib/*.functions.ts` (all use `supabase.from(...)` / `.rpc(...)`)
- `.env` / env vars: `SUPABASE_URL`, `SUPABASE_*_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `supabase/migrations/` (schema is portable; `auth.*` references are the snag)
