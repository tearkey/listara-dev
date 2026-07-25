-- ============================================================================
-- MESSAGING SYSTEM - Phase 2A: Dispute Advocates & Bot Infrastructure
-- ============================================================================
-- Implements bot infrastructure for automatic dispute detection and triage.
-- **CRITICAL**: Disputes can ONLY be raised on PAID escrow transactions.
--
-- Timeline: Week 2-3 of Messaging System implementation (after Phase 1B)
-- Depends on: Phase 1B complete, escrow_transactions table with payment_received_at

-- ============================================================================
-- DISPUTE ADVOCATES TABLE (tracks bot involvement)
-- ============================================================================

CREATE TABLE public.dispute_advocates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL UNIQUE REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  bot_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'investigating', -- investigating | pending_admin | resolved
  analysis_data JSONB DEFAULT '{}', -- {dispute_score, flagged_keywords, claims, summary}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- CRITICAL CONSTRAINT: escrow must have received payment
  CONSTRAINT dispute_advocates_requires_paid_escrow CHECK (
    escrow_id IS NOT NULL
  )
);

CREATE INDEX idx_dispute_advocates_escrow ON public.dispute_advocates(escrow_id);
CREATE INDEX idx_dispute_advocates_thread ON public.dispute_advocates(thread_id);
CREATE INDEX idx_dispute_advocates_status ON public.dispute_advocates(status);
CREATE INDEX idx_dispute_advocates_created ON public.dispute_advocates(created_at DESC);

COMMENT ON TABLE public.dispute_advocates IS 'Tracks bot advocate involvement in disputes. One bot per escrow transaction. Requires escrow to have payment_received_at set (no disputes without payment).';
COMMENT ON COLUMN public.dispute_advocates.analysis_data IS 'JSON analysis from bot: {dispute_score (0-100), flagged_keywords, buyer_claims, seller_claims, summary}.';

-- ============================================================================
-- DISPUTE REQUESTS TABLE (structured disputes for admin)
-- ============================================================================

CREATE TABLE public.dispute_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  dispute_advocate_id UUID REFERENCES public.dispute_advocates(id) ON DELETE CASCADE,
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('bot', 'user')), -- who raised the dispute
  reason TEXT NOT NULL, -- item_not_received | item_defective | not_as_described | seller_unresponsive | other
  evidence_urls TEXT[], -- array of URLs to messages, photos, etc
  analysis JSONB DEFAULT '{}', -- {bot_analysis, claims_summary, score}
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied | more_info_needed | resolved
  admin_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_decision TEXT, -- approved | denied | refund | partial_refund
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dispute_requests_escrow ON public.dispute_requests(escrow_id);
CREATE INDEX idx_dispute_requests_status ON public.dispute_requests(status);
CREATE INDEX idx_dispute_requests_admin ON public.dispute_requests(admin_assigned_to);
CREATE INDEX idx_dispute_requests_created ON public.dispute_requests(created_at DESC);
CREATE INDEX idx_dispute_requests_initiated ON public.dispute_requests(initiated_by);

COMMENT ON TABLE public.dispute_requests IS 'Structured dispute cases for admin review. Linked to escrow_id for payment context and resolution.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.dispute_advocates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_requests ENABLE ROW LEVEL SECURITY;

-- Parties involved in escrow can see dispute advocates
CREATE POLICY "dispute_advocates_see_own"
  ON public.dispute_advocates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.escrow_transactions
      WHERE id = escrow_id
      AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    ) OR
    public.has_role(auth.uid(), 'admin')
  );

-- Only service_role can insert/update dispute advocates (bot only)
CREATE POLICY "dispute_advocates_insert_disabled"
  ON public.dispute_advocates FOR INSERT TO authenticated
  WITH CHECK (false);

-- Parties can see disputes they're involved in
CREATE POLICY "dispute_requests_see_own"
  ON public.dispute_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.escrow_transactions
      WHERE id = escrow_id
      AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    ) OR
    public.has_role(auth.uid(), 'admin')
  );

-- Only service_role can insert disputes (bot or RPC only)
CREATE POLICY "dispute_requests_insert_disabled"
  ON public.dispute_requests FOR INSERT TO authenticated
  WITH CHECK (false);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.dispute_advocates TO authenticated;
GRANT ALL ON public.dispute_advocates TO service_role;
GRANT SELECT ON public.dispute_requests TO authenticated;
GRANT ALL ON public.dispute_requests TO service_role;

-- ============================================================================
-- RPC FUNCTION: Validate escrow is paid (payment received)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_escrow_is_paid(_escrow_id UUID)
RETURNS TABLE(is_valid BOOLEAN, reason TEXT) AS $$
DECLARE
  _escrow public.escrow_transactions;
BEGIN
  SELECT * INTO _escrow
    FROM public.escrow_transactions
    WHERE id = _escrow_id;

  IF _escrow IS NULL THEN
    RETURN QUERY SELECT false, 'Escrow transaction not found';
    RETURN;
  END IF;

  IF _escrow.payment_received_at IS NULL THEN
    RETURN QUERY SELECT false, 'Payment has not been received yet. Disputes require completed payment.';
    RETURN;
  END IF;

  IF _escrow.status NOT IN ('pending', 'shipped', 'in_transit', 'disputed') THEN
    RETURN QUERY SELECT false, 'Escrow is not in a valid state for disputes (status: ' || _escrow.status || ')';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_escrow_is_paid(UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Detect dispute trigger (check keywords in thread)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_dispute_trigger(
  _thread_id UUID,
  _escrow_id UUID
)
RETURNS TABLE(trigger_found BOOLEAN, keyword_count INTEGER, flagged_keywords TEXT[], summary TEXT) AS $$
DECLARE
  _validation public.validate_escrow_is_paid%ROWTYPE;
  _recent_messages RECORD;
  _flagged TEXT[] := ARRAY[]::TEXT[];
  _keyword_count INTEGER := 0;
  _buyer_keywords CONSTANT TEXT[] := ARRAY['didn''t receive', 'defective', 'not working', 'fake', 'scam', 'broken', 'damaged', 'missing', 'wrong item'];
  _seller_keywords CONSTANT TEXT[] := ARRAY['not my fault', 'already sent', 'no refund', 'buyer lying', 'not damaged', 'your fault'];
  _kw TEXT;
BEGIN
  -- CRITICAL: Validate escrow is paid first
  SELECT * INTO _validation
    FROM public.validate_escrow_is_paid(_escrow_id);

  IF NOT _validation.is_valid THEN
    RETURN QUERY SELECT false, 0, ARRAY[]::TEXT[], _validation.reason;
    RETURN;
  END IF;

  -- Scan recent messages (last 24 hours) for keywords
  FOR _recent_messages IN
    SELECT body FROM public.messages
      WHERE thread_id = _thread_id
      AND created_at > now() - INTERVAL '24 hours'
      ORDER BY created_at DESC
  LOOP
    -- Check buyer keywords
    FOREACH _kw IN ARRAY _buyer_keywords LOOP
      IF _recent_messages.body ILIKE '%' || _kw || '%' THEN
        _flagged := array_append(_flagged, _kw);
        _keyword_count := _keyword_count + 1;
      END IF;
    END LOOP;

    -- Check seller keywords
    FOREACH _kw IN ARRAY _seller_keywords LOOP
      IF _recent_messages.body ILIKE '%' || _kw || '%' THEN
        _flagged := array_append(_flagged, _kw);
        _keyword_count := _keyword_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Trigger if 2+ keywords found
  RETURN QUERY SELECT
    (_keyword_count >= 2),
    _keyword_count,
    _flagged,
    CASE WHEN _keyword_count >= 2 THEN 'Dispute keywords detected. Bot advocate recommended.' ELSE 'Insufficient dispute indicators.' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_dispute_trigger(UUID, UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Manually raise dispute from thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.raise_dispute_from_thread(
  _thread_id UUID,
  _reason TEXT,
  _evidence_urls TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _thread public.message_threads;
  _escrow public.escrow_transactions;
  _validation public.validate_escrow_is_paid%ROWTYPE;
  _dispute_id UUID;
BEGIN
  -- Fetch thread and verify caller is participant
  SELECT * INTO _thread
    FROM public.message_threads
    WHERE id = _thread_id;

  IF _thread IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  IF auth.uid() NOT IN (_thread.seller_id, _thread.buyer_id) THEN
    RAISE EXCEPTION 'not a participant in this thread';
  END IF;

  -- Verify escrow is linked to thread
  IF _thread.escrow_id IS NULL THEN
    RAISE EXCEPTION 'no escrow linked to this thread. disputes require a completed transaction.';
  END IF;

  -- CRITICAL: Validate escrow is paid
  SELECT * INTO _validation
    FROM public.validate_escrow_is_paid(_thread.escrow_id);

  IF NOT _validation.is_valid THEN
    RAISE EXCEPTION '%', _validation.reason;
  END IF;

  -- Check if dispute already exists
  IF EXISTS (
    SELECT 1 FROM public.dispute_requests
    WHERE escrow_id = _thread.escrow_id
    AND status NOT IN ('denied', 'resolved')
  ) THEN
    RAISE EXCEPTION 'dispute already exists for this transaction';
  END IF;

  -- Create dispute request
  INSERT INTO public.dispute_requests(
    escrow_id, initiated_by, reason, evidence_urls, analysis
  ) VALUES (
    _thread.escrow_id, 'user', _reason, _evidence_urls,
    jsonb_build_object(
      'raised_by', auth.uid(),
      'thread_id', _thread_id,
      'timestamp', now()
    )
  )
  RETURNING id INTO _dispute_id;

  -- Add system message to thread
  INSERT INTO public.messages(
    ad_id, thread_id, sender_id, recipient_id, body,
    is_system_message, metadata
  ) VALUES (
    _thread.ad_id,
    _thread_id,
    auth.uid(),
    CASE WHEN auth.uid() = _thread.seller_id THEN _thread.buyer_id ELSE _thread.seller_id END,
    'Dispute raised: ' || _reason || '. Listara Bot Advocate joining to review case.',
    true,
    jsonb_build_object('dispute_id', _dispute_id)
  );

  -- TODO: Trigger bot analysis in Phase 2B
  -- RETURN dispute_id to caller
  RETURN _dispute_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_dispute_from_thread(UUID, TEXT, TEXT[]) TO authenticated;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dispute_requests_resolved
  ON public.dispute_requests(resolved_at DESC)
  WHERE status = 'resolved';
