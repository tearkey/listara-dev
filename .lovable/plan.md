# Going-live checklist

The project is already published (public) at https://listara-dev.lovable.app and no security findings are currently open. Below is what still makes sense to verify or wire up before you consider the launch "done."

## 1. Refresh the security scan
Existing findings are cleared, but every scanner is flagged `up_to_date: false` (the newest scan is ~24h old and predates the ranking/inbox/CSV work). Re-run the security scan so nothing new snuck in with the recent SQL functions (`moderation_auto_takedown`, `ad_rank_breakdown`) and admin server functions.

## 2. Verify the scheduled jobs actually fire in production
`expire_stale_ads` and `moderation_auto_takedown` are wired to pg_cron. Confirm on the live backend:
- both entries are present in `cron.job`
- recent rows in `cron.job_run_details` show success (not "role missing" or "function not found")
- an obvious "canary" test row flows through: create a live ad → 5 reports → wait 15 min → check `admin_notifications` and the `/admin/inbox` badge

## 3. Confirm published-side auth + admin gates
On the live URL:
- sign in as a normal user, confirm `/admin` and `/admin/*` redirect / show "Admin access required"
- sign in as an admin, confirm the inbox, auto-takedowns, CSV export, and "Why?" ranking modal all load
- confirm superadmin routes prompt for MFA (`aal2`) as intended

## 4. Content & SEO polish
- Confirm `head()` title + meta description on the root and any leaf routes reflect the Listara brand (no stale "Lovable App" defaults).
- Verify `robots.txt` and `sitemap.xml` are being served at the published domain and list the current public routes.
- Add an `og:image` on the home / key landing routes if you want a real social preview instead of the hosting fallback.

## 5. Custom domain (optional)
Currently live only on `listara-dev.lovable.app`. If you want a real domain (e.g. `listara.com`), connect it under Project settings → Domains, add the A + TXT records, and set it as Primary once it goes Active.

## 6. Payments / NowPayments smoke test
Webhook signing secret (`NOWPAYMENTS_IPN_SECRET`) is set. Do one small real top-up on the live URL and confirm:
- invoice status flips to `paid`
- `add_credits_from_invoice` increments `user_credits`
- an audit / credit_transactions row is written

## 7. Operational hygiene
- CI dependency workflow (`.github/workflows/deps.yml`) is enabled — confirm the first scheduled run has produced an issue (or "no vulnerabilities") so you know it's actually running.
- Turn on backups / note the Cloud instance size in case you need to resize when traffic hits.
- Decide whether you want the "Edit with Lovable" badge visible or hidden on the published site.

## 8. Post-launch monitoring
- Watch `/admin/security` scan history for the first week.
- Watch `/admin/inbox` for `auto_takedown` notifications to make sure the moderation threshold isn't too aggressive.
- Keep an eye on the `audit_log` for anything unexpected under `admin_adjust_credits` or `moderation_auto_takedown`.

## Technical notes
- Re-scan is a single tool call (`security--run_security_scan`); nothing to code.
- pg_cron verification is read-only SQL (`select * from cron.job` / `cron.job_run_details order by start_time desc limit 20`).
- OG image: add a `head()` entry on `src/routes/index.tsx` referencing an absolute https URL — must be on a leaf route, not `__root.tsx`.
- Custom domain and badge visibility both require your explicit go-ahead; I won't touch them without you asking.

Tell me which of these you want me to actually execute (e.g. "run the security scan and check the cron jobs"), and I'll switch to build and do just those.
