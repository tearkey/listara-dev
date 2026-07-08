CREATE OR REPLACE FUNCTION public.purge_abandoned_drafts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.listings
  WHERE status = 'unpaid'
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_abandoned_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_abandoned_drafts() TO service_role;