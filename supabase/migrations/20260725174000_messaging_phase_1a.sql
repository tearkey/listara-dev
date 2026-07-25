-- ============================================================================
-- MESSAGING SYSTEM - Phase 1A: Core Tables & RLS
-- ============================================================================
-- Creates message thread aggregation, extends messages table, and sets up RLS
-- for secure user-to-user messaging within escrow context.
--
-- Timeline: Week 1 of Messaging System implementation
-- Depends on: existing users, ads, messages, escrow_transactions tables

-- ============================================================================
-- MESSAGE THREADS TABLE (aggregates 1:1 conversation metadata)
-- ============================================================================

CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  escrow_id UUID REFERENCES public.escrow_transactions(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  banned_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_threads_buyer ON public.message_threads(buyer_id, last_message_at DESC);
CREATE INDEX idx_message_threads_seller ON public.message_threads(seller_id, last_message_at DESC);
CREATE INDEX idx_message_threads_ad ON public.message_threads(ad_id);
CREATE INDEX idx_message_threads_escrow ON public.message_threads(escrow_id);
CREATE INDEX idx_message_threads_participants ON public.message_threads(seller_id, buyer_id);

COMMENT ON TABLE public.message_threads IS 'Aggregates 1:1 conversation metadata for efficient inbox queries. Each thread represents a buyer-seller conversation on a specific ad. Escrow link is optional but required to raise disputes.';

-- ============================================================================
-- EXTEND MESSAGES TABLE
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.message_threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_system_message BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON public.messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_system ON public.messages(thread_id, is_system_message);

COMMENT ON COLUMN public.messages.thread_id IS 'Foreign key to message_threads for efficient thread queries. Allows multiple messages per ad/sender/recipient pair.';
COMMENT ON COLUMN public.messages.is_system_message IS 'True for bot-advocate messages or dispute notifications. Helps UI distinguish system vs user messages.';
COMMENT ON COLUMN public.messages.metadata IS 'JSON metadata: {media_url, reaction_data, dispute_id, etc}. Extensible for future features.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

-- Participants can see their own threads
CREATE POLICY "message_threads_see_own"
  ON public.message_threads FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = buyer_id);

-- Only participants can insert threads
CREATE POLICY "message_threads_insert_own"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = seller_id OR auth.uid() = buyer_id)
    AND seller_id != buyer_id
  );

-- Participants can update their own threads (archive, mute)
CREATE POLICY "message_threads_update_own"
  ON public.message_threads FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = seller_id OR auth.uid() = buyer_id);

-- Update existing message RLS to reference threads
DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "message_participants_read"
  ON public.messages FOR SELECT TO authenticated
  USING (
    auth.uid() = sender_id OR auth.uid() = recipient_id OR
    EXISTS (
      SELECT 1 FROM public.message_threads
      WHERE id = messages.thread_id
      AND (seller_id = auth.uid() OR buyer_id = auth.uid())
    )
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.message_threads TO authenticated;
GRANT ALL ON public.message_threads TO service_role;

-- Messages table already has grants, just ensure service_role can manage new columns
GRANT ALL ON public.messages TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update message_threads.last_message_at when new message inserted
CREATE OR REPLACE FUNCTION public.update_message_thread_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.message_threads
      SET last_message_at = NEW.created_at, updated_at = now()
      WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_update_thread_timestamp
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_message_thread_last_message();

-- Update message_threads.updated_at on modification
CREATE TRIGGER trg_message_threads_updated_at
  BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RPC FUNCTION: Get or create message thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_message_thread(
  _ad_id UUID,
  _seller_id UUID,
  _buyer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _thread_id UUID;
BEGIN
  IF _seller_id IS NULL OR _buyer_id IS NULL THEN
    RAISE EXCEPTION 'seller_id and buyer_id required';
  END IF;
  IF _seller_id = _buyer_id THEN
    RAISE EXCEPTION 'seller and buyer cannot be the same user';
  END IF;

  -- Try to find existing thread
  SELECT id INTO _thread_id
    FROM public.message_threads
    WHERE ad_id = _ad_id
    AND seller_id = _seller_id
    AND buyer_id = _buyer_id
    LIMIT 1;

  -- If not found, create new thread
  IF _thread_id IS NULL THEN
    INSERT INTO public.message_threads(ad_id, seller_id, buyer_id)
      VALUES (_ad_id, _seller_id, _buyer_id)
      RETURNING id INTO _thread_id;
  END IF;

  RETURN _thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_message_thread(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Send message in thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_thread_message(
  _thread_id UUID,
  _body TEXT,
  _metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _message_id UUID;
  _thread public.message_threads;
  _recipient_id UUID;
BEGIN
  IF _body IS NULL OR _body = '' THEN
    RAISE EXCEPTION 'message body cannot be empty';
  END IF;
  IF LENGTH(_body) > 5000 THEN
    RAISE EXCEPTION 'message exceeds 5000 characters';
  END IF;

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

  -- Determine recipient
  _recipient_id := CASE
    WHEN auth.uid() = _thread.seller_id THEN _thread.buyer_id
    ELSE _thread.seller_id
  END;

  -- Insert message
  INSERT INTO public.messages(
    ad_id, thread_id, sender_id, recipient_id, body, metadata
  ) VALUES (
    _thread.ad_id, _thread_id, auth.uid(), _recipient_id, _body, _metadata
  )
  RETURNING id INTO _message_id;

  RETURN _message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_thread_message(UUID, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Mark thread as read
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_thread_messages_read(_thread_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is thread participant
  IF NOT EXISTS (
    SELECT 1 FROM public.message_threads
    WHERE id = _thread_id
    AND (seller_id = auth.uid() OR buyer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not a participant in this thread';
  END IF;

  -- Mark all messages received by caller as read
  UPDATE public.messages
    SET read_at = now()
    WHERE thread_id = _thread_id
    AND recipient_id = auth.uid()
    AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_thread_messages_read(UUID) TO authenticated;

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_message_threads_not_archived
  ON public.message_threads(seller_id, buyer_id)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages(recipient_id, read_at)
  WHERE read_at IS NULL;
