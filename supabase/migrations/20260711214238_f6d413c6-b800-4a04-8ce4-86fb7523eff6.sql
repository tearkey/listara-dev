
-- 1) Profiles: restrict public-readable columns via column-level grants
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;

-- Broad SELECT policy remains (row-level allow-all); column grants below scope which
-- columns anon/authenticated may actually read. Owner full-row reads go through
-- server code that uses the service-role client.
CREATE POLICY "Profiles safe columns readable" ON public.profiles
  FOR SELECT
  USING (true);

-- Owner may read own full row via authenticated client only if column grants allow.
-- We remove full-table SELECT and grant only safe columns to anon/authenticated.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url, bio, created_at, reputation)
  ON public.profiles TO anon, authenticated;

-- 2) Lock down SECURITY DEFINER admin/maintenance functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_site_health() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_export_snapshot() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_summary(timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_series(timestamptz, timestamptz, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pgrst_reload_schema() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_abandoned_drafts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_ads() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_credits_from_invoice(uuid, integer, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_prevent_tamper() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ads_update_search_vector() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_user_credits() FROM anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
