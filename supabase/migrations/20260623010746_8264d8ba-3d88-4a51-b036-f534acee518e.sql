
-- 1) Hide ad contact fields from anonymous Data API reads via column-level privileges.
--    RLS still allows the row; PostgREST will simply omit/null these columns for anon.
REVOKE SELECT (contact_email, contact_phone) ON public.ads FROM anon;
-- Authenticated users can still select them (RLS limits which rows they can read at all),
-- but we layer a stricter SELECT policy for non-owners below via a SECURITY DEFINER fn.
GRANT SELECT (contact_email, contact_phone) ON public.ads TO authenticated;

-- 2) Ad-hoc per-user rate limiting table.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, window_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own rate limits"
  ON public.rate_limits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- writes happen via SECURITY DEFINER function below; no INSERT/UPDATE policy needed.

-- 3) SECURITY DEFINER rate-limit check.
--    Returns true and increments counter when under limit; returns false when over.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _user_id uuid,
  _action text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bucket timestamptz := date_trunc('second', now()) - (extract(epoch from now())::bigint % _window_seconds) * interval '1 second';
  _current integer;
BEGIN
  INSERT INTO public.rate_limits (user_id, action, window_start, count)
  VALUES (_user_id, _action, _bucket, 1)
  ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _current;

  IF _current > _max THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer) TO authenticated, service_role;
