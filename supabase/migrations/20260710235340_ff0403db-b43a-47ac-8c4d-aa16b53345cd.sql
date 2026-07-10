
-- =============================================================================
-- 1) SITE SETTINGS (key/value store)
-- =============================================================================
CREATE TABLE public.site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  section     TEXT NOT NULL,        -- 'general' | 'permalinks' | 'seo' | 'integrations' | 'system'
  is_public   BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL    ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public settings readable by anyone"
  ON public.site_settings FOR SELECT TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "admins read all settings"
  ON public.site_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage settings"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_site_settings_updated
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default sections
INSERT INTO public.site_settings (key, section, is_public, value, description) VALUES
  ('general', 'general', true, jsonb_build_object(
      'site_title', 'Classifieds',
      'tagline', 'Local classifieds, done right.',
      'timezone', 'America/New_York',
      'privacy_policy_path', '/privacy',
      'terms_path', '/terms',
      'contact_email', ''
   ), 'General & Privacy'),
  ('permalinks', 'permalinks', true, jsonb_build_object(
      'ad_url_pattern',   '/ads/:city/:category/:slug-:short_id',
      'blog_url_pattern', '/blog/:year/:month/:slug',
      'category_url_pattern', '/c/:category',
      'trailing_slash', false
   ), 'URL structure for ads and blog posts'),
  ('seo', 'seo', true, jsonb_build_object(
      'default_meta_title_suffix', ' — Classifieds',
      'default_meta_description', 'Buy, sell, and discover locally.',
      'default_og_image', '',
      'twitter_handle', '',
      'noindex_paths', jsonb_build_array('/admin', '/auth')
   ), 'SEO defaults (RankMath-style)'),
  ('integrations', 'integrations', false, jsonb_build_object(
      'gtm_id', '',
      'ga4_id', '',
      'cloudflare_zone_id', '',
      'cloudflare_api_token_secret_name', 'CLOUDFLARE_API_TOKEN',
      'firewall_enabled', false,
      'ip_allowlist', jsonb_build_array(),
      'ip_blocklist', jsonb_build_array()
   ), 'Integrations & Security'),
  ('system', 'system', false, jsonb_build_object(
      'svg_upload_enabled', false,
      'svg_sanitize_strict', true,
      'maintenance_mode', false
   ), 'System-level toggles');

-- Public helper (safe for SSR, no bearer required)
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM public.site_settings
    WHERE is_public = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- =============================================================================
-- 2) SEO METADATA BUNDLE
-- =============================================================================
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS seo_title        TEXT,
  ADD COLUMN IF NOT EXISTS meta_description TEXT,
  ADD COLUMN IF NOT EXISTS og_image         TEXT,
  ADD COLUMN IF NOT EXISTS canonical_url    TEXT,
  ADD COLUMN IF NOT EXISTS focus_keywords   TEXT[];

-- =============================================================================
-- 3) BLOG POSTS (also carrying the SEO bundle)
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE public.post_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.blog_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  excerpt          TEXT,
  body_markdown    TEXT NOT NULL DEFAULT '',
  cover_image      TEXT,
  status           post_status NOT NULL DEFAULT 'draft',
  published_at     TIMESTAMPTZ,
  seo_title        TEXT,
  meta_description TEXT,
  og_image         TEXT,
  canonical_url    TEXT,
  focus_keywords   TEXT[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_posts_status_pub ON public.blog_posts (status, published_at DESC);
CREATE INDEX idx_blog_posts_author ON public.blog_posts (author_id);

GRANT SELECT              ON public.blog_posts TO anon, authenticated;
GRANT INSERT,UPDATE,DELETE ON public.blog_posts TO authenticated;
GRANT ALL                  ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read published posts"
  ON public.blog_posts FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "authors read own posts"
  ON public.blog_posts FOR SELECT TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "admins read all posts"
  ON public.blog_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authors write own posts"
  ON public.blog_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "authors update own posts"
  ON public.blog_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "authors delete own posts"
  ON public.blog_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_blog_posts_updated
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4) VISUAL PAGE BUILDER — layouts + templates
-- =============================================================================
CREATE TABLE public.page_layouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,      -- e.g. 'home-hero', 'ad-single-default'
  name         TEXT NOT NULL,
  description  TEXT,
  document     JSONB NOT NULL,            -- validated schema; see docs/architecture/page-builder.md
  css_override TEXT,                      -- optional raw CSS injected in a scoped block
  is_active    BOOLEAN NOT NULL DEFAULT true,
  version      INT NOT NULL DEFAULT 1,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.page_layouts TO anon, authenticated;
GRANT ALL    ON public.page_layouts TO service_role;
ALTER TABLE public.page_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active layouts"
  ON public.page_layouts FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "admins manage layouts"
  ON public.page_layouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_page_layouts_updated
  BEFORE UPDATE ON public.page_layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Template = "use layout X for post-type Y"
CREATE TABLE public.page_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type   TEXT NOT NULL,          -- 'blog_single'|'blog_archive'|'ad_single'|'ad_archive'|'home'|'custom'
  scope_key   TEXT,                   -- e.g. category slug for ad_archive; NULL = default
  layout_id   UUID NOT NULL REFERENCES public.page_layouts(id) ON DELETE CASCADE,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_type, scope_key)
);

GRANT SELECT ON public.page_templates TO anon, authenticated;
GRANT ALL    ON public.page_templates TO service_role;
ALTER TABLE public.page_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads templates"
  ON public.page_templates FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage templates"
  ON public.page_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_page_templates_updated
  BEFORE UPDATE ON public.page_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 5) SITE HEALTH RPC (admin-only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_site_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t0 timestamptz := clock_timestamp();
  _db_ping_ms numeric;
  _ads_total  bigint;
  _pending    bigint;
  _live       bigint;
  _users      bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  PERFORM 1;
  _db_ping_ms := EXTRACT(EPOCH FROM (clock_timestamp() - _t0)) * 1000;
  SELECT COUNT(*) INTO _ads_total FROM public.ads;
  SELECT COUNT(*) INTO _pending   FROM public.ads WHERE status = 'pending';
  SELECT COUNT(*) INTO _live      FROM public.ads WHERE status = 'live';
  SELECT COUNT(*) INTO _users     FROM auth.users;
  RETURN jsonb_build_object(
    'db_ping_ms', ROUND(_db_ping_ms, 2),
    'postgres_version', current_setting('server_version'),
    'ads_total', _ads_total,
    'ads_pending', _pending,
    'ads_live', _live,
    'users_total', _users,
    'checked_at', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_site_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_site_health() TO authenticated;

-- =============================================================================
-- 6) JSON EXPORT RPC (admin-only) — returns key app tables as JSONB dump
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_export_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  RETURN jsonb_build_object(
    'exported_at', now(),
    'site_settings',  (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.site_settings t),
    'page_layouts',   (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.page_layouts t),
    'page_templates', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.page_templates t),
    'feature_flags',  (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.feature_flags t),
    'cities',         (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.cities t),
    'categories',     (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.categories t),
    'subcategories',  (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM public.subcategories t)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_export_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_export_snapshot() TO authenticated;
