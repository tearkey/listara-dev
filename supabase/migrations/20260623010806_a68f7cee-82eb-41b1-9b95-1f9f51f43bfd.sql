
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _action text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bucket timestamptz;
  _current integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  _bucket := date_trunc('second', now())
           - (extract(epoch from now())::bigint % _window_seconds) * interval '1 second';

  INSERT INTO public.rate_limits (user_id, action, window_start, count)
  VALUES (_uid, _action, _bucket, 1)
  ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _current;

  RETURN _current <= _max;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.consume_rate_limit(uuid, text, integer, integer);
