-- ============================================================================
-- ESCROW SYSTEM - Phase 1: Core Tables & RPC Functions
-- ============================================================================
-- This migration implements the foundation for the escrow-backed marketplace
-- supporting both product sales (UsedTech) and dating services.
--
-- Timeline: Week 1-3 of UsedTech + Escrow implementation
-- Depends on: existing users, ads, and profiles tables

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.escrow_status AS ENUM (
  'pending',        -- payment received, awaiting seller shipment
  'shipped',        -- seller marked item as shipped
  'in_transit',     -- buyer marked as received/inspecting
  'released',       -- buyer confirmed satisfaction, payment released
  'refunded',       -- buyer rejected, refund issued
  'disputed'        -- both parties dispute, admin review
);

COMMENT ON TYPE public.escrow_status IS 'Lifecycle states for escrow transactions. Funds transition from pending → shipped → in_transit → released/refunded/disputed.';

-- ============================================================================
-- TABLES
-- ============================================================================

-- Main escrow transaction ledger
CREATE TABLE public.escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  commission_percent NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  status public.escrow_status NOT NULL DEFAULT 'pending',

  -- Payment tracking
  payment_method TEXT NOT NULL DEFAULT 'stripe', -- 'stripe' | 'nowpayments' | 'credits'
  payment_id TEXT, -- stripe charge_id or nowpayments invoice_id

  -- Timeline
  payment_received_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  confirmed_satisfied_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,

  -- Auto-release after 21 days if buyer never confirms
  auto_release_at TIMESTAMPTZ,

  -- Metadata
  notes JSONB DEFAULT '{}', -- {shipping_tracking, issues, resolution}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_escrow_buyer ON public.escrow_transactions(buyer_id, status);
CREATE INDEX idx_escrow_seller ON public.escrow_transactions(seller_id, status);
CREATE INDEX idx_escrow_ad ON public.escrow_transactions(ad_id);
CREATE INDEX idx_escrow_status ON public.escrow_transactions(status);

COMMENT ON TABLE public.escrow_transactions IS 'Core escrow ledger. Tracks payment lifecycle from buyer checkout through seller release. Funds held by platform until buyer confirms satisfaction.';

-- Dispute tracking
CREATE TABLE public.escrow_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- 'item_not_received' | 'item_defective' | 'not_as_described' | 'seller_unresponsive'
  evidence TEXT, -- link to photos/video
  resolution TEXT, -- 'refund' | 'partial_refund' | 'replacement' | 'closed'
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- admin who resolved
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_escrow_disputes_escrow ON public.escrow_disputes(escrow_id);
CREATE INDEX idx_escrow_disputes_initiated_by ON public.escrow_disputes(initiated_by);

COMMENT ON TABLE public.escrow_disputes IS 'Audit log for escrow disputes. Tracks issues raised during transaction and resolution.';

-- Daily escrow balance reconciliation (for accounting + float tracking)
CREATE TABLE public.escrow_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_held_cents INTEGER NOT NULL DEFAULT 0,
  total_released_cents INTEGER NOT NULL DEFAULT 0,
  float_earned_cents INTEGER NOT NULL DEFAULT 0,
  transactions_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.escrow_balance IS 'Daily reconciliation ledger. Tracks total held funds for accounting, float revenue earned, and transaction counts. Used for revenue reporting.';

-- Seller ratings (tied to escrow transactions)
CREATE TABLE public.seller_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating_stars INTEGER NOT NULL CHECK (rating_stars >= 1 AND rating_stars <= 5),
  comment TEXT,
  aspects JSONB DEFAULT '{}', -- {communication, shipping_speed, condition_accuracy, would_buy_again}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seller_ratings_seller ON public.seller_ratings(seller_id, created_at DESC);
CREATE INDEX idx_seller_ratings_escrow ON public.seller_ratings(escrow_id);

COMMENT ON TABLE public.seller_ratings IS 'Post-transaction seller ratings by buyers. Used to build seller reputation and trust score.';

-- ============================================================================
-- ADD COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Electronics-specific fields on ads table
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS condition_type TEXT CHECK (condition_type IN (
    'pristine', 'excellent', 'good', 'fair', 'needs_repair'
  )),
  ADD COLUMN IF NOT EXISTS electronics_specs JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_condition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_condition_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ads.condition_type IS 'For electronics: pristine|excellent|good|fair|needs_repair. Used for condition-based pricing.';
COMMENT ON COLUMN public.ads.electronics_specs IS 'JSON object with electronics specs: {brand, model, cpu, ram, storage, year, etc}.';

-- Electronics seller fields on profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_electronics_seller BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS electronics_sales_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS electronics_avg_rating NUMERIC(3,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS electronics_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.is_electronics_seller IS 'True if user is verified to sell electronics. Requires approval via verification workflow.';
COMMENT ON COLUMN public.profiles.electronics_sales_count IS 'Number of successful electronics transactions (incremented on escrow release).';
COMMENT ON COLUMN public.profiles.electronics_avg_rating IS 'Average rating across all seller_ratings for this user (0.00 to 5.00).';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ratings ENABLE ROW LEVEL SECURITY;

-- Users can see their own escrow transactions
CREATE POLICY "escrow_txns_see_own"
  ON public.escrow_transactions FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Only service_role can insert escrow (via RPC)
CREATE POLICY "escrow_txns_insert_disabled"
  ON public.escrow_transactions FOR INSERT TO authenticated
  WITH CHECK (false);

-- Only service_role can update escrow (via RPC)
CREATE POLICY "escrow_txns_update_disabled"
  ON public.escrow_transactions FOR UPDATE TO authenticated
  WITH CHECK (false);

-- Users can see disputes they're involved in
CREATE POLICY "escrow_disputes_see_own"
  ON public.escrow_disputes FOR SELECT TO authenticated
  USING (
    initiated_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.escrow_transactions
      WHERE id = escrow_id
      AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    )
  );

-- Only service_role can insert disputes (via RPC)
CREATE POLICY "escrow_disputes_insert_disabled"
  ON public.escrow_disputes FOR INSERT TO authenticated
  WITH CHECK (false);

-- Users can see seller ratings for sellers they bought from
CREATE POLICY "seller_ratings_see_own"
  ON public.seller_ratings FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid() OR
    seller_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.escrow_transactions
      WHERE id = escrow_id
      AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    )
  );

-- Buyers can insert ratings for transactions they participated in
CREATE POLICY "seller_ratings_insert_own"
  ON public.seller_ratings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id AND
    EXISTS (
      SELECT 1 FROM public.escrow_transactions
      WHERE id = escrow_id
      AND buyer_id = auth.uid()
      AND status = 'released'
    )
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.escrow_transactions TO authenticated;
GRANT SELECT ON public.escrow_disputes TO authenticated;
GRANT SELECT ON public.seller_ratings TO authenticated;
GRANT INSERT ON public.seller_ratings TO authenticated;
GRANT ALL ON public.escrow_transactions TO service_role;
GRANT ALL ON public.escrow_disputes TO service_role;
GRANT ALL ON public.escrow_balance TO service_role;
GRANT ALL ON public.seller_ratings TO service_role;

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- 1. CREATE ESCROW TRANSACTION (buyer initiates purchase)
-- Called when buyer clicks "Buy Now" and payment is processed
CREATE OR REPLACE FUNCTION public.create_escrow_transaction(
  _ad_id UUID,
  _buyer_id UUID,
  _seller_id UUID,
  _amount_cents INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _escrow_id UUID;
  _auto_release_at TIMESTAMPTZ;
BEGIN
  IF _buyer_id IS NULL OR _seller_id IS NULL THEN
    RAISE EXCEPTION 'buyer_id and seller_id required';
  END IF;
  IF _amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  IF _buyer_id = _seller_id THEN
    RAISE EXCEPTION 'buyer and seller cannot be the same user';
  END IF;

  -- Auto-release funds 21 days after shipment (if buyer never confirms)
  _auto_release_at := now() + INTERVAL '21 days';

  INSERT INTO public.escrow_transactions(
    ad_id, buyer_id, seller_id, amount_cents, status,
    auto_release_at, payment_received_at
  ) VALUES (
    _ad_id, _buyer_id, _seller_id, _amount_cents, 'pending',
    _auto_release_at, now()
  )
  RETURNING id INTO _escrow_id;

  RETURN _escrow_id;
END;
$$;

-- 2. MARK SHIPPED (seller confirms shipment with tracking)
-- Called when seller ships the item
CREATE OR REPLACE FUNCTION public.escrow_mark_shipped(
  _escrow_id UUID,
  _tracking_number TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.escrow_transactions
    SET status = 'shipped',
        shipped_at = now(),
        notes = notes || jsonb_build_object('tracking', _tracking_number),
        updated_at = now()
    WHERE id = _escrow_id
    AND seller_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found, already shipped, or not owned by seller';
  END IF;
END;
$$;

-- 3. MARK RECEIVED (buyer marks item as received/inspecting)
-- Called when buyer receives the item and starts inspection period
CREATE OR REPLACE FUNCTION public.escrow_mark_received(
  _escrow_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.escrow_transactions
    SET status = 'in_transit',
        received_at = now(),
        updated_at = now()
    WHERE id = _escrow_id
    AND buyer_id = auth.uid()
    AND status = 'shipped';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found, not yet shipped, or not owned by buyer';
  END IF;
END;
$$;

-- 4. CONFIRM SATISFIED (buyer releases funds to seller)
-- Called when buyer confirms item meets expectations
CREATE OR REPLACE FUNCTION public.escrow_confirm_satisfied(
  _escrow_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seller_id UUID;
  _amount_cents INTEGER;
BEGIN
  SELECT seller_id, amount_cents
    INTO _seller_id, _amount_cents
    FROM public.escrow_transactions
    WHERE id = _escrow_id AND buyer_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found or not owned by buyer';
  END IF;

  -- Update escrow status to released
  UPDATE public.escrow_transactions
    SET status = 'released',
        confirmed_satisfied_at = now(),
        released_at = now(),
        updated_at = now()
    WHERE id = _escrow_id;

  -- TODO: Release funds to seller via Stripe payout
  -- This is async: seller receives funds 1-2 business days later

END;
$$;

-- 5. DISPUTE INITIATED (buyer or seller raises concern)
-- Called when party claims issue during transaction
CREATE OR REPLACE FUNCTION public.escrow_initiate_dispute(
  _escrow_id UUID,
  _reason TEXT,
  _evidence_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is involved in the escrow
  IF NOT EXISTS (
    SELECT 1 FROM public.escrow_transactions
    WHERE id = _escrow_id
    AND (buyer_id = auth.uid() OR seller_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Escrow not found or user not involved';
  END IF;

  -- Insert dispute record
  INSERT INTO public.escrow_disputes(
    escrow_id, initiated_by, reason, evidence
  ) VALUES (
    _escrow_id, auth.uid(), _reason, _evidence_url
  );

  -- Mark escrow as disputed
  UPDATE public.escrow_transactions
    SET status = 'disputed',
        updated_at = now()
    WHERE id = _escrow_id AND status IN ('shipped', 'in_transit');

END;
$$;

-- 6. AUTO RELEASE (cron job - run daily)
-- Releases funds automatically if 21 days have passed and buyer hasn't confirmed
-- This prevents seller from being held indefinitely
CREATE OR REPLACE FUNCTION public.escrow_auto_release()
RETURNS TABLE(released_count INTEGER) AS $$
DECLARE
  _released_count INTEGER;
BEGIN
  UPDATE public.escrow_transactions
    SET status = 'released',
        released_at = now(),
        updated_at = now()
    WHERE status IN ('shipped', 'in_transit')
    AND auto_release_at <= now()
    AND released_at IS NULL;

  GET DIAGNOSTICS _released_count = ROW_COUNT;

  RETURN QUERY SELECT _released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANT RPC PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_escrow_transaction(UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escrow_mark_shipped(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escrow_mark_received(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escrow_confirm_satisfied(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escrow_initiate_dispute(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escrow_auto_release() TO service_role;

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_escrow_created_at ON public.escrow_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrow_auto_release ON public.escrow_transactions(auto_release_at) WHERE status IN ('shipped', 'in_transit');
