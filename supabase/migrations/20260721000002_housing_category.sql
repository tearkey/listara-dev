-- ============================================================================
-- HOUSING CATEGORY + STRUCTURED AD ATTRIBUTES + PER-CATEGORY AD LIFETIME
-- ============================================================================
-- Housing is a launch category for the lean pivot. Rentals need structured
-- fields (bedrooms, rent period, …) and a much longer shelf life than the
-- 24-hour default that suits personals — a rental listing that dies in a day
-- kills both liquidity and SEO.

ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO public.categories (slug, name, icon, description, sort_order)
VALUES (
  'housing',
  'Housing',
  'Home',
  'Apartments, rooms, sublets, and homes for rent or sale near you.',
  1
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.subcategories (category_id, slug, name, description, sort_order)
SELECT c.id, subcat.slug, subcat.name, subcat.description, subcat.sort_order
FROM (
  SELECT 'apts-for-rent', 'Apartments for Rent', 'Apartments and condos for rent', 1 UNION ALL
  SELECT 'rooms-shares', 'Rooms & Shares', 'Rooms for rent and roommate shares', 2 UNION ALL
  SELECT 'sublets-temporary', 'Sublets & Temporary', 'Short-term sublets and temporary housing', 3 UNION ALL
  SELECT 'houses-for-rent', 'Houses for Rent', 'Single-family homes and townhouses for rent', 4 UNION ALL
  SELECT 'real-estate-for-sale', 'Real Estate for Sale', 'Homes, condos, and land for sale', 5 UNION ALL
  SELECT 'vacation-short-term', 'Vacation & Short-Term', 'Vacation rentals and short stays', 6 UNION ALL
  SELECT 'parking-storage', 'Parking & Storage', 'Parking spots, garages, and storage space', 7 UNION ALL
  SELECT 'housing-wanted', 'Housing Wanted', 'People looking for a place to live', 8
) AS subcat(slug, name, description, sort_order)
JOIN public.categories c ON c.slug = 'housing'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Generic per-ad structured attributes (bedrooms, sqft, …), configured
-- per-category in src/lib/category-attrs.ts. JSONB instead of columns so the
-- next structured category doesn't need another migration.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS attrs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ads.attrs IS
  'Category-specific structured fields (e.g. housing: bedrooms, bathrooms, sqft, rent_period, pets_ok). Shape is defined per category in the app.';

-- Anonymous SELECT on ads is column-whitelisted; without this grant public
-- pages silently lose the new column.
GRANT SELECT (attrs) ON public.ads TO anon, authenticated;

-- Per-category ad lifetime. Default preserves the existing 24h behavior;
-- housing listings live for 30 days.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS ad_lifetime_hours INT NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.categories.ad_lifetime_hours IS
  'How long a live ad in this category stays up before expiring. Read by createAd when computing expires_at.';

UPDATE public.categories SET ad_lifetime_hours = 720 WHERE slug = 'housing';

NOTIFY pgrst, 'reload schema';
