-- ============================================================================
-- MODULE (PLUGIN) SYSTEM
-- ============================================================================
-- WordPress-style plugin management adapted to a sealed-bundle runtime (see
-- docs/architecture/plugin-system.md). Module code ships in the repo under
-- src/modules/<slug>/; these tables only track which modules are active and
-- their per-site config. The admin Plugins screen flips is_active and the
-- change takes effect on the next request — no redeploy.

CREATE TABLE public.modules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  kind             TEXT NOT NULL CHECK (kind IN ('plugin','theme')),
  name             TEXT NOT NULL,
  description      TEXT,
  version          TEXT NOT NULL,
  min_core_version TEXT NOT NULL DEFAULT '0.0.0',
  entry_path       TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  activated_at     TIMESTAMPTZ,
  activated_by     UUID REFERENCES auth.users(id),
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.modules IS
  'Registry of installable feature modules shipped in the app bundle. Activation is data, code is repo.';

CREATE TABLE public.module_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  changelog   TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_id, version)
);

CREATE TABLE public.module_bindings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('action','filter','route','slot')),
  target       TEXT NOT NULL,
  priority     INT NOT NULL DEFAULT 10
);

COMMENT ON TABLE public.module_bindings IS
  'What a module touches (hooks, routes, slots) — surfaced in the admin Plugins screen so activation is never a mystery.';

CREATE TRIGGER trg_modules_updated
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activation state must be readable by everyone (public routes like /blog gate
-- on it for anonymous visitors), but config may hold module settings that are
-- not for public eyes — restrict readable columns instead of the whole row.
GRANT SELECT (id, slug, kind, name, description, version, is_active)
  ON public.modules TO anon, authenticated;
GRANT ALL ON public.modules TO service_role;
GRANT SELECT ON public.module_versions TO authenticated;
GRANT ALL ON public.module_versions TO service_role;
GRANT SELECT ON public.module_bindings TO authenticated;
GRANT ALL ON public.module_bindings TO service_role;

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module activation state is public"
  ON public.modules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "module versions readable when signed in"
  ON public.module_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "module bindings readable when signed in"
  ON public.module_bindings FOR SELECT TO authenticated USING (true);
-- All writes go through the service-role client in admin server functions.

-- Seed the modules shipped in this release (inactive until an admin turns
-- them on from /admin/modules).
INSERT INTO public.modules (slug, kind, name, description, version, entry_path)
VALUES
  ('blog', 'plugin', 'Blog',
   'Publish articles with RankMath-style SEO fields. Adds /blog to the site, a Blog section to the admin panel, and blog posts to the sitemap.',
   '0.1.0', 'src/modules/blog'),
  ('turnstile', 'plugin', 'Turnstile Anti-Bot',
   'Cloudflare Turnstile captcha on sign-up, sign-in, and ad posting. Requires VITE_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.',
   '0.1.0', 'src/modules/turnstile')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.module_versions (module_id, version, changelog)
SELECT m.id, m.version, 'Initial release'
FROM public.modules m
WHERE m.slug IN ('blog', 'turnstile')
ON CONFLICT (module_id, version) DO NOTHING;

INSERT INTO public.module_bindings (module_id, binding_type, target)
SELECT m.id, b.binding_type, b.target
FROM public.modules m
JOIN (
  SELECT 'blog' AS slug, 'route' AS binding_type, '/blog' AS target UNION ALL
  SELECT 'blog', 'route', '/blog/:slug' UNION ALL
  SELECT 'blog', 'route', '/admin/blog' UNION ALL
  SELECT 'blog', 'filter', 'sitemap.urls' UNION ALL
  SELECT 'blog', 'slot', 'nav.header_links' UNION ALL
  SELECT 'blog', 'slot', 'admin.nav' UNION ALL
  SELECT 'turnstile', 'slot', 'auth.captcha' UNION ALL
  SELECT 'turnstile', 'action', 'ad.before_create'
) AS b ON b.slug = m.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.module_bindings mb
  WHERE mb.module_id = m.id AND mb.binding_type = b.binding_type AND mb.target = b.target
);

NOTIFY pgrst, 'reload schema';
