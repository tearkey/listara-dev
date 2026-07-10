
-- Feature flags for module toggles
CREATE TABLE public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.feature_flags TO anon, authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flags readable by everyone"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "admins manage flags"
  ON public.feature_flags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER feature_flags_touch
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feature_flags(key, enabled, description) VALUES
  ('blog', false, 'Public blog / CMS module'),
  ('adult_section', false, 'Adult classifieds section (18+, moderated)'),
  ('promotions', true, 'Paid ad promotions (bump / featured / sticky)'),
  ('multi_city_posting', true, 'Post one ad to multiple cities at once'),
  ('credit_topups', true, 'Allow users to buy credits')
ON CONFLICT (key) DO NOTHING;

-- Admin credit adjustments: allow admins to grant/revoke credits with audit
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  _target_user UUID,
  _delta_cents INTEGER,
  _reason TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _new_balance INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  IF _delta_cents = 0 THEN RAISE EXCEPTION 'delta must be non-zero'; END IF;

  INSERT INTO public.user_credits(user_id, balance_cents)
    VALUES (_target_user, GREATEST(_delta_cents, 0))
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = GREATEST(public.user_credits.balance_cents + EXCLUDED.balance_cents - GREATEST(_delta_cents, 0) + _delta_cents, 0),
          updated_at = now()
    RETURNING balance_cents INTO _new_balance;

  INSERT INTO public.credit_transactions(user_id, delta_cents, reason)
    VALUES (_target_user, _delta_cents, 'admin:' || COALESCE(_reason, 'adjustment'));

  INSERT INTO public.audit_log(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'admin_adjust_credits', 'user', _target_user,
            jsonb_build_object('delta_cents', _delta_cents, 'reason', _reason));

  RETURN _new_balance;
END; $$;
