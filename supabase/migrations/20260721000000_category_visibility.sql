-- ============================================================================
-- CATEGORY VISIBILITY + LEAN-PIVOT DATA FIXES
-- ============================================================================
-- The marketplace pivot parks the escrow/UsedTech launch: Electronics is
-- hidden (not deleted — ads.category_id has a plain FK with no ON DELETE, and
-- history should survive), and the Personals category copy no longer promises
-- escrow protection. Everything here is idempotent so it converges whether or
-- not the 20260719* category migrations ever applied successfully in an
-- environment (they originally failed on fresh databases before the
-- subcategories.description patch).

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_adult BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories.is_active IS
  'Hidden categories keep their rows (and ads history) but are excluded from public listing, browse, and sitemap. Toggled from the admin catalog.';
COMMENT ON COLUMN public.categories.is_adult IS
  'Adult categories show an 18+ age gate on browse pages and require an age confirmation when posting.';

-- Park Electronics until the escrow marketplace relaunches. No-op if the row
-- never made it into this environment.
UPDATE public.categories SET is_active = false WHERE slug = 'electronics';

-- Personals: re-upsert with escrow-free copy, and make sure its subcategories
-- exist even where the original dating migration failed before inserting them.
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO public.categories (slug, name, icon, description, sort_order)
VALUES (
  'personals',
  'Personals & Dating',
  'Heart',
  'Meet people near you — dating, friends, and activity partners.',
  2
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

UPDATE public.categories SET is_adult = true WHERE slug = 'personals';

INSERT INTO public.subcategories (category_id, slug, name, description, sort_order)
SELECT c.id, subcat.slug, subcat.name, subcat.description, subcat.sort_order
FROM (
  SELECT 'seeking-women', 'Women Seeking Men', 'Women looking to meet men locally', 1 UNION ALL
  SELECT 'seeking-men', 'Men Seeking Women', 'Men looking to meet women locally', 2 UNION ALL
  SELECT 'seeking-couples', 'Couples & Throuples', 'Couples and non-traditional relationship seekers', 3 UNION ALL
  SELECT 'friends', 'Friends & Hangout', 'Looking for new friends, activity partners, no romance', 4
) AS subcat(slug, name, description, sort_order)
JOIN public.categories c ON c.slug = 'personals'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Blog permalinks: MVP ships flat /blog/:slug URLs; keep the stored pattern in
-- sync with what the routes actually serve.
UPDATE public.site_settings
SET value = jsonb_set(value, '{blog_url_pattern}', '"/blog/:slug"')
WHERE key = 'permalinks';

NOTIFY pgrst, 'reload schema';
