
REVOKE EXECUTE ON FUNCTION public.moderation_auto_takedown_dry_run(integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_cron_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_cron_health() FROM PUBLIC, anon, authenticated;
