
REVOKE EXECUTE ON FUNCTION public.ad_rank_breakdown(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_rank_breakdown(UUID) TO service_role;
