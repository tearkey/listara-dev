
-- Restrict anonymous SELECT on ads to non-sensitive columns only.
-- Authenticated users retain full SELECT (row visibility is still enforced by RLS
-- so owners/admins keep access to contact fields on their own rows).
REVOKE SELECT ON public.ads FROM anon;
GRANT SELECT (
  id, short_id, user_id, city_id, category_id, subcategory_id,
  title, slug, body, price_cents, currency, allow_messages,
  status, tier, tier_expires_at, posted_at, expires_at, bumped_at,
  view_count, report_count, created_at, updated_at,
  seo_title, meta_description, og_image, canonical_url, focus_keywords
) ON public.ads TO anon;

-- Restrict anonymous SELECT on profiles to non-sensitive display columns only.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, avatar_url, bio, created_at) ON public.profiles TO anon;

-- Refresh PostgREST schema cache so new column privileges take effect immediately.
NOTIFY pgrst, 'reload schema';
