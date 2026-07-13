
CREATE OR REPLACE FUNCTION public.spend_credits(_user_id uuid, _amount_cents integer, _reason text, _ad_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new_balance INTEGER;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.user_credits(user_id, balance_cents) VALUES (_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_credits
    SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE user_id = _user_id AND balance_cents >= _amount_cents
    RETURNING balance_cents INTO _new_balance;
  IF _new_balance IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.credit_transactions(user_id, delta_cents, reason, ad_id)
    VALUES (_user_id, -_amount_cents, _reason, _ad_id);
  RETURN TRUE;
END; $function$;

-- Drop the old signature that read auth.uid() and was executable by authenticated.
DROP FUNCTION IF EXISTS public.spend_credits(integer, text, uuid);

-- Only trusted server-side code may call this SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.spend_credits(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, uuid) TO service_role;
