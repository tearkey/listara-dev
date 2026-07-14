
REVOKE ALL ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) TO service_role;
