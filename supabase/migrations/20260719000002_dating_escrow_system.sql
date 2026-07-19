-- ============================================================================
-- DATING/PERSONALS CATEGORY & ESCROW SYSTEM
-- ============================================================================
-- This migration creates the "Personals/Dating" category and the date_escrows
-- table for romance scam prevention through meet confirmation escrow.
--
-- Phase 3 of implementation (Weeks 5-6): Dating Escrow with ID verification
-- Focus: "Date Verified, Not Fooled" - prevent catfishing and romance scams

-- ============================================================================
-- ADD ID VERIFICATION FIELDS TO PROFILES
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_photo_url TEXT, -- encrypted/hashed
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified'; -- unverified|pending|verified|rejected

COMMENT ON COLUMN public.profiles.phone_verified_at IS 'Timestamp when phone number was verified via SMS code.';
COMMENT ON COLUMN public.profiles.id_verified_at IS 'Timestamp when photo ID was verified (liveness + ID match).';
COMMENT ON COLUMN public.profiles.id_photo_url IS 'Encrypted URL of verified ID photo. Used for liveness + face matching.';
COMMENT ON COLUMN public.profiles.verification_status IS 'Overall verification status: unverified|pending|verified|rejected. Must be verified to create dating profile.';

-- ============================================================================
-- ENUMS FOR DATING
-- ============================================================================

CREATE TYPE public.date_confirmation_status AS ENUM (
  'pending',      -- escrow created, awaiting meet
  'scheduled',    -- both users confirm date/time
  'met',          -- initiator confirms meeting happened
  'confirmed',    -- recipient also confirms, meeting verified
  'released',     -- funds released, conversation continues
  'no_show',      -- initiator didn't show, auto-refund
  'disputed'      -- claims of fake identity or miscommunication
);

COMMENT ON TYPE public.date_confirmation_status IS 'Lifecycle for date confirmation escrow. Prevents catfishing by holding funds until both parties confirm meeting.';

-- ============================================================================
-- DATING ESCROW TABLE
-- ============================================================================

CREATE TABLE public.date_escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL DEFAULT 2000, -- $20 standard
  status public.date_confirmation_status NOT NULL DEFAULT 'pending',

  -- Timeline
  scheduled_at TIMESTAMPTZ, -- when they plan to meet
  initiator_confirmed_met_at TIMESTAMPTZ,
  recipient_confirmed_met_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  auto_release_at TIMESTAMPTZ, -- 14 days if no confirmation

  -- Metadata
  notes JSONB DEFAULT '{}', -- {location, meeting_type: 'coffee'|'dinner'|'virtual', etc}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_date_escrows_initiator ON public.date_escrows(initiator_id, status);
CREATE INDEX idx_date_escrows_recipient ON public.date_escrows(recipient_id, status);
CREATE INDEX idx_date_escrows_status ON public.date_escrows(status);
CREATE INDEX idx_date_escrows_auto_release ON public.date_escrows(auto_release_at) WHERE status IN ('pending', 'scheduled', 'met');

COMMENT ON TABLE public.date_escrows IS 'Dating escrow ledger. Holds $20 per date until both parties confirm meeting happened. Prevents catfishing and romance scams by tying money to real-world verification.';

-- Dating dispute tracking
CREATE TABLE public.date_escrow_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_escrow_id UUID NOT NULL REFERENCES public.date_escrows(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- 'fake_profile'|'no_show'|'not_as_described'|'felt_unsafe'
  evidence TEXT, -- link to photos/screenshots
  resolution TEXT, -- 'refund'|'partial_refund'|'account_flagged'|'closed'
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_date_disputes_escrow ON public.date_escrow_disputes(date_escrow_id);
CREATE INDEX idx_date_disputes_initiated_by ON public.date_escrow_disputes(initiated_by);

COMMENT ON TABLE public.date_escrow_disputes IS 'Dispute log for date escrows. Used when person claims fake identity, no-show, or safety concerns.';

-- ============================================================================
-- DATING CATEGORY
-- ============================================================================

INSERT INTO public.categories (slug, name, icon, description, sort_order)
VALUES (
  'personals',
  'Personals & Dating',
  'Heart',
  'Verified local dating. Every profile confirmed. Meet safely with escrow protection against catfishing.',
  2
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- Dating subcategories
INSERT INTO public.subcategories (category_id, slug, name, description, sort_order)
SELECT
  c.id,
  subcat.slug,
  subcat.name,
  subcat.description,
  subcat.sort_order
FROM (
  SELECT 'seeking-women', 'Women Seeking Men', 'Women looking to meet men locally', 1 UNION ALL
  SELECT 'seeking-men', 'Men Seeking Women', 'Men looking to meet women locally', 2 UNION ALL
  SELECT 'seeking-couples', 'Couples & Throuples', 'Couples and non-traditional relationship seekers', 3 UNION ALL
  SELECT 'friends', 'Friends & Hangout', 'Looking for new friends, activity partners, no romance', 4
) AS subcat(slug, name, description, sort_order)
JOIN public.categories c ON c.slug = 'personals'
ON CONFLICT (category_id, slug) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.date_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_escrow_disputes ENABLE ROW LEVEL SECURITY;

-- Users can see their own date escrows
CREATE POLICY "date_escrows_see_own"
  ON public.date_escrows FOR SELECT TO authenticated
  USING (auth.uid() = initiator_id OR auth.uid() = recipient_id);

-- Only service_role can insert/update (via RPC)
CREATE POLICY "date_escrows_insert_disabled"
  ON public.date_escrows FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "date_escrows_update_disabled"
  ON public.date_escrows FOR UPDATE TO authenticated
  WITH CHECK (false);

-- Users can see disputes they're involved in
CREATE POLICY "date_disputes_see_own"
  ON public.date_escrow_disputes FOR SELECT TO authenticated
  USING (
    initiated_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.date_escrows
      WHERE id = date_escrow_id
      AND (initiator_id = auth.uid() OR recipient_id = auth.uid())
    )
  );

CREATE POLICY "date_disputes_insert_disabled"
  ON public.date_escrow_disputes FOR INSERT TO authenticated
  WITH CHECK (false);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.date_escrows TO authenticated;
GRANT SELECT ON public.date_escrow_disputes TO authenticated;
GRANT ALL ON public.date_escrows TO service_role;
GRANT ALL ON public.date_escrow_disputes TO service_role;

-- ============================================================================
-- RPC FUNCTIONS FOR DATING ESCROW
-- ============================================================================

-- 1. CREATE DATE ESCROW (initiator starts date with $20 confirmation hold)
CREATE OR REPLACE FUNCTION public.create_date_escrow(
  _recipient_id UUID,
  _scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _escrow_id UUID;
  _initiator_id UUID := auth.uid();
  _auto_release_at TIMESTAMPTZ;
BEGIN
  IF _initiator_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _recipient_id IS NULL THEN
    RAISE EXCEPTION 'recipient_id required';
  END IF;
  IF _initiator_id = _recipient_id THEN
    RAISE EXCEPTION 'cannot create date with yourself';
  END IF;

  -- Both users must be verified to participate in dating
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _initiator_id AND verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'initiator must be verified to create date';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _recipient_id AND verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'recipient must be verified to receive date request';
  END IF;

  -- Auto-release after 14 days if no confirmation
  _auto_release_at := now() + INTERVAL '14 days';

  INSERT INTO public.date_escrows(
    initiator_id, recipient_id, amount_cents, status,
    scheduled_at, auto_release_at
  ) VALUES (
    _initiator_id, _recipient_id, 2000, 'pending',
    _scheduled_at, _auto_release_at
  )
  RETURNING id INTO _escrow_id;

  RETURN _escrow_id;
END;
$$;

-- 2. CONFIRM SCHEDULED (both users agree on date/time)
CREATE OR REPLACE FUNCTION public.date_confirm_scheduled(
  _date_escrow_id UUID,
  _scheduled_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.date_escrows
    SET status = 'scheduled',
        scheduled_at = _scheduled_at,
        updated_at = now()
    WHERE id = _date_escrow_id
    AND (initiator_id = auth.uid() OR recipient_id = auth.uid())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Date escrow not found or already confirmed';
  END IF;
END;
$$;

-- 3. CONFIRM MET (user confirms they met the other person)
CREATE OR REPLACE FUNCTION public.date_confirm_met(
  _date_escrow_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.date_confirmation_status;
  _initiator_id UUID;
  _recipient_id UUID;
BEGIN
  SELECT status, initiator_id, recipient_id
    INTO _status, _initiator_id, _recipient_id
    FROM public.date_escrows
    WHERE id = _date_escrow_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Date escrow not found';
  END IF;

  IF _status NOT IN ('scheduled', 'pending') THEN
    RAISE EXCEPTION 'Date cannot be confirmed in current status';
  END IF;

  -- Update based on who's confirming
  IF auth.uid() = _initiator_id THEN
    UPDATE public.date_escrows
      SET initiator_confirmed_met_at = now(),
          updated_at = now()
      WHERE id = _date_escrow_id;

    -- If recipient already confirmed, release funds
    IF EXISTS (
      SELECT 1 FROM public.date_escrows
      WHERE id = _date_escrow_id
      AND recipient_confirmed_met_at IS NOT NULL
    ) THEN
      UPDATE public.date_escrows
        SET status = 'confirmed',
            released_at = now(),
            updated_at = now()
        WHERE id = _date_escrow_id;
    ELSE
      UPDATE public.date_escrows
        SET status = 'met',
            updated_at = now()
        WHERE id = _date_escrow_id
        AND status = 'scheduled';
    END IF;

  ELSIF auth.uid() = _recipient_id THEN
    UPDATE public.date_escrows
      SET recipient_confirmed_met_at = now(),
          updated_at = now()
      WHERE id = _date_escrow_id;

    -- If initiator already confirmed, release funds
    IF EXISTS (
      SELECT 1 FROM public.date_escrows
      WHERE id = _date_escrow_id
      AND initiator_confirmed_met_at IS NOT NULL
    ) THEN
      UPDATE public.date_escrows
        SET status = 'confirmed',
            released_at = now(),
            updated_at = now()
        WHERE id = _date_escrow_id;
    ELSE
      UPDATE public.date_escrows
        SET status = 'met',
            updated_at = now()
        WHERE id = _date_escrow_id
        AND status = 'scheduled';
    END IF;
  ELSE
    RAISE EXCEPTION 'User not involved in this date';
  END IF;
END;
$$;

-- 4. DISPUTE DATE (claim fake profile or safety issue)
CREATE OR REPLACE FUNCTION public.date_dispute(
  _date_escrow_id UUID,
  _reason TEXT,
  _evidence_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.date_escrows
    WHERE id = _date_escrow_id
    AND (initiator_id = auth.uid() OR recipient_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Date escrow not found or user not involved';
  END IF;

  INSERT INTO public.date_escrow_disputes(
    date_escrow_id, initiated_by, reason, evidence
  ) VALUES (
    _date_escrow_id, auth.uid(), _reason, _evidence_url
  );

  UPDATE public.date_escrows
    SET status = 'disputed',
        updated_at = now()
    WHERE id = _date_escrow_id;
END;
$$;

-- 5. AUTO RELEASE (cron job - run daily)
-- Releases funds automatically if 14 days have passed with no confirmation
CREATE OR REPLACE FUNCTION public.date_escrow_auto_release()
RETURNS TABLE(released_count INTEGER) AS $$
DECLARE
  _released_count INTEGER;
BEGIN
  UPDATE public.date_escrows
    SET status = 'no_show',
        released_at = now(),
        updated_at = now()
    WHERE status IN ('pending', 'scheduled', 'met')
    AND auto_release_at <= now()
    AND released_at IS NULL;

  GET DIAGNOSTICS _released_count = ROW_COUNT;

  RETURN QUERY SELECT _released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANT RPC PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_date_escrow(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.date_confirm_scheduled(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.date_confirm_met(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.date_dispute(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.date_escrow_auto_release() TO service_role;

-- ============================================================================
-- SAFETY INDEXES
-- ============================================================================

-- Optimize fraud detection queries
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles(verification_status)
  WHERE verification_status = 'verified';

-- Track flagged users
CREATE INDEX IF NOT EXISTS idx_date_disputes_reason
  ON public.date_escrow_disputes(reason)
  WHERE reason = 'fake_profile';

COMMENT ON TABLE public.categories IS 'Product & service categories. Personals/Dating category requires ID verification (phone + ID photo + liveness check) for all participants.';
