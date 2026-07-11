-- Authenticated users: full DML on every public table (RLS still gates rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Service role: full access for edge functions / admin code.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Anonymous visitors: read-only on tables that have a TO anon SELECT policy.
GRANT SELECT ON
  public.ads,
  public.ad_images,
  public.states,
  public.cities,
  public.categories,
  public.subcategories,
  public.blog_posts,
  public.page_layouts,
  public.page_templates,
  public.feature_flags,
  public.locations,
  public.banned_keywords,
  public.site_settings
TO anon;

NOTIFY pgrst, 'reload schema';