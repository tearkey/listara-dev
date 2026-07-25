-- ============================================================================
-- MESSAGING SYSTEM - Phase 2B: Bot Analysis & Dispute Request Generation
-- ============================================================================
-- Implements bot analysis of thread messages to extract claims and create
-- structured dispute requests for admin review.
--
-- Timeline: Week 3 of Messaging System implementation (after Phase 2A)
-- Depends on: Phase 2A complete, dispute_advocates + dispute_requests tables

-- ============================================================================
-- RPC FUNCTION: Analyze thread for dispute (bot intelligence)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.analyze_thread_for_dispute(
  _thread_id UUID,
  _escrow_id UUID
)
RETURNS TABLE(
  dispute_score NUMERIC,
  buyer_claims TEXT[],
  seller_claims TEXT[],
  flagged_keywords TEXT[],
  summary TEXT
) AS $$
DECLARE
  _messages RECORD;
  _buyer_claims TEXT[] := ARRAY[]::TEXT[];
  _seller_claims TEXT[] := ARRAY[]::TEXT[];
  _flagged_keywords TEXT[] := ARRAY[]::TEXT[];
  _total_messages INTEGER := 0;
  _disputed_messages INTEGER := 0;
  _dispute_score NUMERIC := 0;
  _summary TEXT := '';
BEGIN
  -- Fetch all messages in thread
  FOR _messages IN
    SELECT
      m.sender_id,
      m.body,
      m.created_at,
      t.seller_id,
      t.buyer_id
    FROM public.messages m
    JOIN public.message_threads t ON m.thread_id = t.id
    WHERE m.thread_id = _thread_id
    ORDER BY m.created_at DESC
  LOOP
    _total_messages := _total_messages + 1;

    -- Extract buyer claims
    IF _messages.sender_id = _messages.buyer_id THEN
      IF _messages.body ILIKE '%didn''t receive%' OR _messages.body ILIKE '%not received%' THEN
        _buyer_claims := array_append(_buyer_claims, 'Item not received');
        _disputed_messages := _disputed_messages + 1;
        _flagged_keywords := array_append(_flagged_keywords, 'item_not_received');
      END IF;
      IF _messages.body ILIKE '%defective%' OR _messages.body ILIKE '%damaged%' OR _messages.body ILIKE '%broken%' THEN
        _buyer_claims := array_append(_buyer_claims, 'Item defective/damaged');
        _disputed_messages := _disputed_messages + 1;
        _flagged_keywords := array_append(_flagged_keywords, 'item_defective');
      END IF;
      IF _messages.body ILIKE '%not as described%' OR _messages.body ILIKE '%different%' OR _messages.body ILIKE '%fake%' THEN
        _buyer_claims := array_append(_buyer_claims, 'Not as described');
        _disputed_messages := _disputed_messages + 1;
        _flagged_keywords := array_append(_flagged_keywords, 'not_as_described');
      END IF;
    END IF;

    -- Extract seller claims
    IF _messages.sender_id = _messages.seller_id THEN
      IF _messages.body ILIKE '%already sent%' OR _messages.body ILIKE '%shipped%' THEN
        _seller_claims := array_append(_seller_claims, 'Item already shipped');
        _flagged_keywords := array_append(_flagged_keywords, 'item_shipped');
      END IF;
      IF _messages.body ILIKE '%not my fault%' OR _messages.body ILIKE '%your fault%' THEN
        _seller_claims := array_append(_seller_claims, 'Blaming buyer');
        _disputed_messages := _disputed_messages + 1;
        _flagged_keywords := array_append(_flagged_keywords, 'blame_buyer');
      END IF;
      IF _messages.body ILIKE '%no refund%' OR _messages.body ILIKE '%won''t refund%' THEN
        _seller_claims := array_append(_seller_claims, 'Refusing refund');
        _disputed_messages := _disputed_messages + 1;
        _flagged_keywords := array_append(_flagged_keywords, 'refusing_refund');
      END IF;
    END IF;
  END LOOP;

  -- Calculate dispute score (0-100)
  IF _total_messages > 0 THEN
    _dispute_score := (_disputed_messages::NUMERIC / _total_messages::NUMERIC) * 100;
    _dispute_score := LEAST(100, _dispute_score);
  ELSE
    _dispute_score := 0;
  END IF;

  -- Generate summary
  _summary := format(
    'Conversation analyzed: %s messages, %s disputed. Buyer claims: %s. Seller claims: %s. Score: %.0f%%',
    _total_messages,
    _disputed_messages,
    COALESCE(array_length(_buyer_claims, 1)::TEXT, '0'),
    COALESCE(array_length(_seller_claims, 1)::TEXT, '0'),
    _dispute_score
  );

  RETURN QUERY SELECT
    _dispute_score,
    _buyer_claims,
    _seller_claims,
    _flagged_keywords,
    _summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.analyze_thread_for_dispute(UUID, UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Create dispute request from bot analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_dispute_request_from_analysis(
  _escrow_id UUID,
  _thread_id UUID,
  _analysis JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dispute_id UUID;
  _dispute_advocate_id UUID;
  _thread public.message_threads;
  _bot_user_id UUID;
BEGIN
  -- Verify dispute doesn't already exist
  IF EXISTS (
    SELECT 1 FROM public.dispute_requests
    WHERE escrow_id = _escrow_id
    AND status NOT IN ('denied', 'resolved')
  ) THEN
    RAISE EXCEPTION 'dispute already exists for this escrow';
  END IF;

  -- Fetch thread for context
  SELECT * INTO _thread FROM public.message_threads WHERE id = _thread_id;
  IF _thread IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  -- Get or create bot user (special system user)
  -- For now, use a placeholder UUID for bot
  _bot_user_id := '00000000-0000-0000-0000-000000000001'::UUID;

  -- Create dispute advocate record
  INSERT INTO public.dispute_advocates(
    escrow_id, thread_id, bot_user_id, status, analysis_data
  ) VALUES (
    _escrow_id, _thread_id, _bot_user_id, 'pending_admin', _analysis
  )
  RETURNING id INTO _dispute_advocate_id;

  -- Create dispute request
  INSERT INTO public.dispute_requests(
    escrow_id,
    dispute_advocate_id,
    initiated_by,
    reason,
    analysis,
    status
  ) VALUES (
    _escrow_id,
    _dispute_advocate_id,
    'bot',
    _analysis->>'summary' || ' (Auto-detected)',
    _analysis,
    'pending'
  )
  RETURNING id INTO _dispute_id;

  -- Add system message to thread
  INSERT INTO public.messages(
    ad_id,
    thread_id,
    sender_id,
    recipient_id,
    body,
    is_system_message,
    metadata
  ) VALUES (
    _thread.ad_id,
    _thread_id,
    _bot_user_id,
    _thread.buyer_id, -- Send to both? Use buyer as recipient
    'Dispute detected by Listara Bot Advocate. Case ID: ' || _dispute_id::TEXT || '. An admin will review and decide on a resolution.',
    true,
    jsonb_build_object('dispute_id', _dispute_id, 'dispute_advocate_id', _dispute_advocate_id)
  );

  -- TODO: Send admin notification via admin_notifications table
  -- INSERT INTO public.admin_notifications(...)

  RETURN _dispute_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dispute_request_from_analysis(UUID, UUID, JSONB) TO service_role;

-- ============================================================================
-- RPC FUNCTION: Trigger bot analysis + create dispute request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_bot_analysis_and_create_request(
  _escrow_id UUID,
  _thread_id UUID
)
RETURNS TABLE(
  dispute_id UUID,
  dispute_score NUMERIC,
  summary TEXT
) AS $$
DECLARE
  _analysis_result RECORD;
  _dispute_id UUID;
BEGIN
  -- Analyze thread
  SELECT * INTO _analysis_result
    FROM public.analyze_thread_for_dispute(_thread_id, _escrow_id);

  -- Create analysis JSONB
  _dispute_id := public.create_dispute_request_from_analysis(
    _escrow_id,
    _thread_id,
    jsonb_build_object(
      'dispute_score', _analysis_result.dispute_score,
      'buyer_claims', _analysis_result.buyer_claims,
      'seller_claims', _analysis_result.seller_claims,
      'flagged_keywords', _analysis_result.flagged_keywords,
      'summary', _analysis_result.summary
    )
  );

  RETURN QUERY SELECT
    _dispute_id,
    _analysis_result.dispute_score,
    _analysis_result.summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.trigger_bot_analysis_and_create_request(UUID, UUID) TO service_role;

-- ============================================================================
-- SCHEDULE: Periodic bot scanning (run every 5 minutes via cron)
-- ============================================================================

-- NOTE: This would typically be set up as a cron job in Supabase
-- or via a background worker. For now, document the function that
-- would be called:

CREATE OR REPLACE FUNCTION public.scan_threads_for_disputes()
RETURNS TABLE(
  processed_count INTEGER,
  disputes_created INTEGER
) AS $$
DECLARE
  _thread RECORD;
  _dispute_trigger RECORD;
  _processed INTEGER := 0;
  _disputes INTEGER := 0;
BEGIN
  -- Find message threads with active, paid escrows that haven't been processed
  FOR _thread IN
    SELECT
      mt.id as thread_id,
      mt.escrow_id,
      et.status as escrow_status,
      et.payment_received_at
    FROM public.message_threads mt
    JOIN public.escrow_transactions et ON mt.escrow_id = et.id
    WHERE et.payment_received_at IS NOT NULL
    AND et.status IN ('pending', 'shipped', 'in_transit')
    AND NOT EXISTS (
      SELECT 1 FROM public.dispute_advocates
      WHERE thread_id = mt.id
    )
    AND mt.last_message_at > now() - INTERVAL '24 hours'
    LIMIT 50 -- Process max 50 per run
  LOOP
    _processed := _processed + 1;

    -- Check for dispute trigger
    SELECT * INTO _dispute_trigger
      FROM public.detect_dispute_trigger(_thread.thread_id, _thread.escrow_id);

    -- If triggered, create dispute via bot
    IF _dispute_trigger.trigger_found THEN
      PERFORM public.trigger_bot_analysis_and_create_request(
        _thread.escrow_id,
        _thread.thread_id
      );
      _disputes := _disputes + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _processed, _disputes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.scan_threads_for_disputes() IS 'Scans active escrow threads for dispute triggers. Should be called every 5 minutes by cron job.';

GRANT EXECUTE ON FUNCTION public.scan_threads_for_disputes() TO service_role;

-- ============================================================================
-- INDEXES FOR DISPUTE QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_disputes_by_status_date
  ON public.dispute_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_admin_assigned
  ON public.dispute_requests(admin_assigned_to)
  WHERE admin_assigned_to IS NOT NULL;
