
REVOKE EXECUTE ON FUNCTION public.moderation_auto_takedown(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.moderation_auto_takedown_dry_run(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown_dry_run(integer, integer) TO service_role;
