
-- 1) Prevent tampering with messages: only read_at may be modified on UPDATE.
CREATE OR REPLACE FUNCTION public.messages_prevent_tamper()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.ad_id IS DISTINCT FROM OLD.ad_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read_at may be updated on messages';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_prevent_tamper ON public.messages;
CREATE TRIGGER messages_prevent_tamper
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_prevent_tamper();

-- Tighten the UPDATE policy to authenticated recipients with an explicit WITH CHECK.
DROP POLICY IF EXISTS "Recipients can mark read" ON public.messages;
CREATE POLICY "Recipients can mark read"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- 2) Switch consume_rate_limit from SECURITY DEFINER to SECURITY INVOKER and
--    rely on RLS for the rate_limits table.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _action text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
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

-- Allow users to write only their own rate-limit rows (SECURITY INVOKER now needs this).
DROP POLICY IF EXISTS "Users insert own rate limits" ON public.rate_limits;
CREATE POLICY "Users insert own rate limits"
  ON public.rate_limits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own rate limits" ON public.rate_limits;
CREATE POLICY "Users update own rate limits"
  ON public.rate_limits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
