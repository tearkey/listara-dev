-- Lock down default PUBLIC execute on our new SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.spend_credits(INTEGER, TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(INTEGER, TEXT, UUID) TO authenticated, service_role;

-- Set fixed search path on the trigger function.
CREATE OR REPLACE FUNCTION public.touch_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;