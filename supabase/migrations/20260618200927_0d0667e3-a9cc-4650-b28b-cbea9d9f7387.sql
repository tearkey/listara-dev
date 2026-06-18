
-- Pin search_path on remaining functions
ALTER FUNCTION public.ad_rank_score(public.ad_tier, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) SET search_path = public;

-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- handle_new_user runs only via the auth.users trigger as the table owner, no user EXECUTE needed.
