-- ============================================================================
-- ELECTRONICS CATEGORY & SUBCATEGORIES
-- ============================================================================
-- This migration creates the "Electronics & Computers" category with 30+
-- subcategories for the UsedTech niche marketplace.
--
-- The category is marked as featured and optimized for condition-based listings.

-- The base schema's subcategories table has no description column; the inserts
-- below depend on it, so add it first (no-op where it already exists).
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS description TEXT;

-- Ensure the Electronics category exists with proper metadata
INSERT INTO public.categories (slug, name, icon, description, sort_order)
VALUES (
  'electronics',
  'Electronics & Computers',
  'Laptop',
  'Buy and sell used electronics, computers, phones, and tech gear with verified condition and buyer protection.',
  1
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- Get the electronics category ID for subcategory insertion
-- Note: This is done via a subquery in the main INSERT below

INSERT INTO public.subcategories (category_id, slug, name, description, sort_order)
SELECT
  c.id,
  subcat.slug,
  subcat.name,
  subcat.description,
  subcat.sort_order
FROM (
  SELECT 'laptops', 'Laptops', 'Laptops, MacBooks, ultrabooks, and gaming laptops', 1 UNION ALL
  SELECT 'desktop', 'Desktop Computers', 'Desktop PCs, gaming rigs, workstations', 2 UNION ALL
  SELECT 'phones', 'Smartphones', 'iPhones, Android phones, and mobile devices', 3 UNION ALL
  SELECT 'tablets', 'Tablets', 'iPad, Android tablets, and e-readers', 4 UNION ALL
  SELECT 'audio', 'Headphones & Audio', 'Headphones, earbuds, speakers, and audio equipment', 5 UNION ALL
  SELECT 'cameras', 'Digital Cameras', 'DSLR, mirrorless, point-and-shoot cameras', 6 UNION ALL
  SELECT 'gaming-consoles', 'Gaming Consoles', 'PlayStation, Xbox, Nintendo gaming systems', 7 UNION ALL
  SELECT 'gaming-accessories', 'Gaming Accessories', 'Controllers, headsets, gaming chairs, peripherals', 8 UNION ALL
  SELECT 'monitors', 'Monitors & Displays', 'Computer monitors, TV screens, projectors', 9 UNION ALL
  SELECT 'keyboards-mice', 'Keyboards & Mice', 'Mechanical keyboards, gaming mice, peripherals', 10 UNION ALL
  SELECT 'storage', 'Storage Devices', 'Hard drives, SSDs, USB drives, memory cards', 11 UNION ALL
  SELECT 'memory', 'Memory & RAM', 'RAM modules, laptop memory, DDR4/DDR5', 12 UNION ALL
  SELECT 'networking', 'Networking Equipment', 'Routers, modems, network switches, WiFi equipment', 13 UNION ALL
  SELECT 'graphics-cards', 'Graphics Cards', 'GPUs, NVIDIA, AMD graphics cards', 14 UNION ALL
  SELECT 'printers', 'Printers & Scanners', 'Inkjet, laser, multifunction printers', 15 UNION ALL
  SELECT 'power-supplies', 'Power Supplies', 'PSU, UPS, power banks, charging equipment', 16 UNION ALL
  SELECT 'cables-adapters', 'Cables & Adapters', 'Charging cables, HDMI, USB adapters, connectors', 17 UNION ALL
  SELECT 'docking', 'Docking Stations', 'Laptop docks, USB-C docks, port replicators', 18 UNION ALL
  SELECT 'laptop-bags', 'Laptop Bags & Cases', 'Sleeves, backpacks, protective cases', 19 UNION ALL
  SELECT 'stands-mounts', 'Stands & Mounts', 'Monitor stands, monitor arms, laptop stands', 20 UNION ALL
  SELECT 'smartwatches', 'Smartwatches & Fitness', 'Apple Watch, Fitbit, Garmin wearables', 21 UNION ALL
  SELECT 'smart-home', 'Smart Home Devices', 'Echo, Google Home, smart lights, smart plugs', 22 UNION ALL
  SELECT 'wearables', 'Other Wearables', 'VR headsets, AR glasses, smart glasses', 23 UNION ALL
  SELECT 'car-electronics', 'Car Electronics', 'Dashcams, GPS, car audio, backup cameras', 24 UNION ALL
  SELECT 'drones', 'Drones & Accessories', 'DJI drones, drone batteries, propellers', 25 UNION ALL
  SELECT 'video-equipment', 'Video Equipment', 'Camcorders, action cameras, gimbal stabilizers', 26 UNION ALL
  SELECT 'recording-audio', 'Recording & Audio Gear', 'Microphones, mixing boards, recording equipment', 27 UNION ALL
  SELECT 'networking-tools', 'Networking & Tools', 'Network testers, ethernet testers, tech tools', 28 UNION ALL
  SELECT 'server-equipment', 'Server & Enterprise', 'Rack servers, networking appliances, enterprise gear', 29 UNION ALL
  SELECT 'vintage-retro', 'Vintage & Retro', 'Classic computers, retro gaming, vintage tech', 30 UNION ALL
  SELECT 'computer-parts', 'Other Computer Parts', 'Motherboards, CPUs, coolers, other components', 31 UNION ALL
  SELECT 'bundles', 'Tech Bundles', 'Bundled electronics and accessories deals', 32
) AS subcat(slug, name, description, sort_order)
JOIN public.categories c ON c.slug = 'electronics'
ON CONFLICT (category_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- FEATURE FLAGS FOR ELECTRONICS CATEGORY
-- ============================================================================
-- Mark this category as requiring condition verification for better trust

COMMENT ON TABLE public.categories IS 'Product categories. Electronics category requires condition_type for all listings.';

-- ============================================================================
-- INDEXES FOR ELECTRONICS DISCOVERY
-- ============================================================================

-- Optimize queries for electronics listings by condition
CREATE INDEX IF NOT EXISTS idx_ads_electronics_condition
  ON public.ads(category_id, condition_type, created_at DESC)
  WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'electronics');

-- Optimize seller searches for electronics
CREATE INDEX IF NOT EXISTS idx_profiles_electronics_seller
  ON public.profiles(is_electronics_seller)
  WHERE is_electronics_seller = true;

-- ============================================================================
-- AUDIT & DOCUMENTATION
-- ============================================================================

COMMENT ON CATEGORY public.categories.electronics IS 'Electronics & Computers marketplace. Primary niche for UsedTech MVP. Requires condition_type enum and supports seller verification.';

-- Mark Electronics as a strategic category requiring moderation
INSERT INTO public.audit_log (actor_id, action, target_table, target_id, detail)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'category_created',
  'categories',
  (SELECT id FROM public.categories WHERE slug = 'electronics'),
  jsonb_build_object(
    'reason', 'UsedTech niche launch - primary revenue driver',
    'phase', 'Phase 1 - MVP Foundation',
    'focus', 'Condition-based pricing with escrow protection'
  )
)
ON CONFLICT DO NOTHING;
