REVOKE EXECUTE ON FUNCTION public.admin_cron_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_status() TO service_role;