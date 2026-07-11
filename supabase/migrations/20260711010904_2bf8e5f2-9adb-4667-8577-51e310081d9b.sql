
CREATE OR REPLACE FUNCTION public.pgrst_reload_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  NOTIFY pgrst, 'reload schema';
END;
$$;

REVOKE ALL ON FUNCTION public.pgrst_reload_schema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pgrst_reload_schema() TO authenticated, service_role;

-- Reload once now so the FKs added earlier are visible immediately.
NOTIFY pgrst, 'reload schema';
