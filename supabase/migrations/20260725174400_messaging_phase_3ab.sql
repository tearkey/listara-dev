-- ============================================================================
-- MESSAGING SYSTEM - Phase 3A & 3B: Admin Dispute Resolution
-- ============================================================================
-- Implements admin dispute management dashboard and automated resolution logic.
-- Admins can review disputes, approve/deny, and auto-release/refund escrow.
--
-- Timeline: Week 4 of Messaging System implementation (after Phase 2B)
-- Depends on: Phase 2B complete, admin access control

-- ============================================================================
-- RPC FUNCTION: List disputes for admin (with filters)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_admin_disputes(
  _status TEXT DEFAULT 'all',
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS TABLE(
  total_count BIGINT,
  disputes JSON
) AS $$
DECLARE
  _offset INTEGER;
  _query_status TEXT;
BEGIN
  _offset := (_page - 1) * _page_size;
  _query_status := CASE WHEN _status = 'all' THEN NULL ELSE _status END;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      dr.id,
      dr.escrow_id,
      dr.reason,
      dr.status,
      dr.initiated_by,
      dr.created_at,
      dr.analysis,
      et.buyer_id,
      et.seller_id,
      et.amount_cents,
      et.payment_received_at,
      a.title as ad_title,
      a.short_id as ad_short_id,
      pb.display_name as buyer_name,
      ps.display_name as seller_name
    FROM public.dispute_requests dr
    JOIN public.escrow_transactions et ON dr.escrow_id = et.id
    JOIN public.ads a ON et.ad_id = a.id
    JOIN public.profiles pb ON et.buyer_id = pb.id
    JOIN public.profiles ps ON et.seller_id = ps.id
    WHERE (_query_status IS NULL OR dr.status = _query_status)
    AND dr.created_at > now() - INTERVAL '90 days'
    ORDER BY
      CASE WHEN dr.status = 'pending' THEN 0 ELSE 1 END,
      dr.created_at DESC
    LIMIT _page_size
    OFFSET _offset
  )
  SELECT
    (SELECT COUNT(*) FROM public.dispute_requests WHERE (_query_status IS NULL OR status = _query_status) AND created_at > now() - INTERVAL '90 days'),
    json_agg(row_to_json(filtered.*)
  FROM filtered;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.list_admin_disputes(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- RPC FUNCTION: Get dispute detail for admin
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dispute_detail(_dispute_id UUID)
RETURNS TABLE(
  dispute JSON,
  messages JSON,
  escrow JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    row_to_json(dr.*),
    json_agg(
      json_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'body', m.body,
        'is_system_message', m.is_system_message,
        'created_at', m.created_at,
        'sender_name', p.display_name,
        'sender_avatar', p.avatar_url
      ) ORDER BY m.created_at ASC
    ) as messages,
    row_to_json(et.*) as escrow
  FROM public.dispute_requests dr
  JOIN public.message_threads mt ON EXISTS (
    SELECT 1 FROM public.message_threads
    WHERE escrow_id = dr.escrow_id
  )
  JOIN public.messages m ON m.thread_id = mt.id
  LEFT JOIN public.profiles p ON m.sender_id = p.id
  JOIN public.escrow_transactions et ON dr.escrow_id = et.id
  WHERE dr.id = _dispute_id
  GROUP BY dr.id, et.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_dispute_detail(UUID) TO service_role;

-- ============================================================================
-- RPC FUNCTION: Resolve dispute (admin decision)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  _dispute_id UUID,
  _decision TEXT, -- 'approved' | 'denied' | 'refund' | 'partial_refund'
  _resolution_notes TEXT,
  _admin_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dispute public.dispute_requests;
  _escrow public.escrow_transactions;
  _thread public.message_threads;
  _buyer_id UUID;
  _seller_id UUID;
BEGIN
  -- Fetch dispute
  SELECT * INTO _dispute FROM public.dispute_requests WHERE id = _dispute_id;
  IF _dispute IS NULL THEN
    RAISE EXCEPTION 'dispute not found';
  END IF;

  -- Fetch escrow and thread
  SELECT * INTO _escrow FROM public.escrow_transactions WHERE id = _dispute.escrow_id;
  SELECT * INTO _thread FROM public.message_threads WHERE escrow_id = _dispute.escrow_id LIMIT 1;

  IF _escrow IS NULL THEN
    RAISE EXCEPTION 'escrow not found';
  END IF;

  _buyer_id := _escrow.buyer_id;
  _seller_id := _escrow.seller_id;

  -- Update dispute with admin decision
  UPDATE public.dispute_requests
    SET
      status = 'resolved',
      admin_decision = _decision,
      admin_assigned_to = _admin_id,
      resolution_notes = _resolution_notes,
      resolved_at = now(),
      updated_at = now()
    WHERE id = _dispute_id;

  -- Execute resolution based on decision
  CASE _decision
    WHEN 'approved' THEN
      -- Approve transaction: release funds to seller
      UPDATE public.escrow_transactions
        SET
          status = 'released',
          confirmed_satisfied_at = now(),
          released_at = now(),
          updated_at = now()
        WHERE id = _dispute.escrow_id;

      -- Add system message
      IF _thread IS NOT NULL THEN
        INSERT INTO public.messages(
          ad_id, thread_id, sender_id, recipient_id, body,
          is_system_message, metadata
        ) VALUES (
          _thread.ad_id,
          _thread.id,
          '00000000-0000-0000-0000-000000000001'::UUID,
          _buyer_id,
          'Dispute approved by Listara admin. Payment released to seller.',
          true,
          jsonb_build_object('dispute_id', _dispute_id, 'decision', 'approved')
        );
      END IF;

    WHEN 'denied' THEN
      -- Deny dispute: keep funds in escrow, revert to previous state
      -- Update dispute status to disputed still
      UPDATE public.escrow_transactions
        SET
          status = 'in_transit', -- Back to normal state
          updated_at = now()
        WHERE id = _dispute.escrow_id
        AND status = 'disputed';

      IF _thread IS NOT NULL THEN
        INSERT INTO public.messages(
          ad_id, thread_id, sender_id, recipient_id, body,
          is_system_message, metadata
        ) VALUES (
          _thread.ad_id,
          _thread.id,
          '00000000-0000-0000-0000-000000000001'::UUID,
          _buyer_id,
          'Dispute denied by Listara admin. ' || COALESCE(_resolution_notes, ''),
          true,
          jsonb_build_object('dispute_id', _dispute_id, 'decision', 'denied')
        );
      END IF;

    WHEN 'refund' THEN
      -- Full refund to buyer: mark escrow as refunded
      UPDATE public.escrow_transactions
        SET
          status = 'refunded',
          refunded_at = now(),
          updated_at = now(),
          notes = notes || jsonb_build_object('refund_reason', _resolution_notes)
        WHERE id = _dispute.escrow_id;

      -- TODO: Process refund via payment provider

      IF _thread IS NOT NULL THEN
        INSERT INTO public.messages(
          ad_id, thread_id, sender_id, recipient_id, body,
          is_system_message, metadata
        ) VALUES (
          _thread.ad_id,
          _thread.id,
          '00000000-0000-0000-0000-000000000001'::UUID,
          _buyer_id,
          'Dispute resolved: Full refund issued to buyer. You will receive funds in 1-2 business days.',
          true,
          jsonb_build_object('dispute_id', _dispute_id, 'decision', 'refund')
        );
      END IF;

    WHEN 'partial_refund' THEN
      -- Partial refund: decision details in resolution_notes
      UPDATE public.escrow_transactions
        SET
          status = 'refunded',
          refunded_at = now(),
          updated_at = now(),
          notes = notes || jsonb_build_object('partial_refund_reason', _resolution_notes)
        WHERE id = _dispute.escrow_id;

      -- TODO: Process partial refund via payment provider

      IF _thread IS NOT NULL THEN
        INSERT INTO public.messages(
          ad_id, thread_id, sender_id, recipient_id, body,
          is_system_message, metadata
        ) VALUES (
          _thread.ad_id,
          _thread.id,
          '00000000-0000-0000-0000-000000000001'::UUID,
          _buyer_id,
          'Dispute resolved with partial refund. ' || COALESCE(_resolution_notes, ''),
          true,
          jsonb_build_object('dispute_id', _dispute_id, 'decision', 'partial_refund')
        );
      END IF;
  END CASE;

  -- Log to audit trail
  INSERT INTO public.audit_log(
    actor_id, action, target_table, target_id, detail
  ) VALUES (
    _admin_id,
    'resolve_dispute',
    'dispute_requests',
    _dispute_id,
    jsonb_build_object(
      'decision', _decision,
      'resolution_notes', _resolution_notes,
      'escrow_id', _dispute.escrow_id
    )
  );

  -- TODO: Send notification to buyer/seller about resolution
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- RPC FUNCTION: Assign dispute to admin
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_dispute_to_admin(
  _dispute_id UUID,
  _admin_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dispute_requests
    SET
      admin_assigned_to = _admin_id,
      status = 'reviewing',
      updated_at = now()
    WHERE id = _dispute_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispute not found or already assigned';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_dispute_to_admin(UUID, UUID) TO service_role;

-- ============================================================================
-- SCHEDULED JOB: Auto-resolve stale disputes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_resolve_stale_disputes()
RETURNS TABLE(resolved_count INTEGER) AS $$
DECLARE
  _count INTEGER;
BEGIN
  -- Resolve disputes pending for 7+ days with refund
  UPDATE public.dispute_requests
    SET
      status = 'resolved',
      admin_decision = 'refund',
      resolution_notes = 'Auto-resolved: No new messages in 7 days. Full refund issued.',
      resolved_at = now()
    WHERE status = 'pending'
    AND created_at < now() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.messages
      WHERE thread_id IN (
        SELECT id FROM public.message_threads
        WHERE escrow_id IN (
          SELECT escrow_id FROM public.dispute_requests
          WHERE id = dispute_requests.id
        )
      )
      AND created_at > dispute_requests.created_at + INTERVAL '24 hours'
    );

  GET DIAGNOSTICS _count = ROW_COUNT;

  -- Also update corresponding escrows to refunded status
  UPDATE public.escrow_transactions
    SET
      status = 'refunded',
      refunded_at = now()
    WHERE id IN (
      SELECT escrow_id FROM public.dispute_requests
      WHERE status = 'resolved'
      AND admin_decision = 'refund'
      AND resolved_at > now() - INTERVAL '1 hour'
      AND status = 'disputed'
    );

  RETURN QUERY SELECT _count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_resolve_stale_disputes() IS 'Runs daily to auto-resolve disputes stale for 7+ days. Refunds buyer.';

GRANT EXECUTE ON FUNCTION public.auto_resolve_stale_disputes() TO service_role;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dispute_requests_pending
  ON public.dispute_requests(created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dispute_requests_assigned
  ON public.dispute_requests(admin_assigned_to, status);
