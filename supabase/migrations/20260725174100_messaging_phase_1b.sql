-- ============================================================================
-- MESSAGING SYSTEM - Phase 1B: Anti-Spam & Moderation Layer
-- ============================================================================
-- Implements rate limiting, message blocks (muting), and message validation
-- to prevent abuse while protecting legitimate users.
--
-- Timeline: Week 1 of Messaging System implementation (after Phase 1A)
-- Depends on: Phase 1A complete, existing banned_keywords table

-- ============================================================================
-- USER RATE LIMITS TABLE
-- ============================================================================

CREATE TABLE public.user_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  messages_sent_today INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  daily_reset_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 day'),
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_user ON public.user_rate_limits(user_id);
CREATE INDEX idx_rate_limits_daily_reset ON public.user_rate_limits(daily_reset_at);

COMMENT ON TABLE public.user_rate_limits IS 'Tracks per-user message rate limits. Enforces daily message limits and cooldown periods to prevent spam.';
COMMENT ON COLUMN public.user_rate_limits.messages_sent_today IS 'Count of messages sent in current day. Reset at daily_reset_at.';
COMMENT ON COLUMN public.user_rate_limits.cooldown_until IS 'If set, user cannot send messages until this timestamp (prevents rapid-fire spam).';

-- ============================================================================
-- MESSAGE BLOCKS TABLE (muting)
-- ============================================================================

CREATE TABLE public.message_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_message_blocks_blocker ON public.message_blocks(blocker_id);
CREATE INDEX idx_message_blocks_blocked ON public.message_blocks(blocked_id);

COMMENT ON TABLE public.message_blocks IS 'Allows users to mute/block other users. Blocks prevent blocked_id from sending messages to blocker_id.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_blocks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own rate limits
CREATE POLICY "user_rate_limits_see_own"
  ON public.user_rate_limits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Only service_role can insert/update rate limits
CREATE POLICY "user_rate_limits_insert_disabled"
  ON public.user_rate_limits FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "user_rate_limits_update_disabled"
  ON public.user_rate_limits FOR UPDATE TO authenticated
  WITH CHECK (false);

-- Users can see their own blocks
CREATE POLICY "message_blocks_see_own"
  ON public.message_blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

-- Users can block/unblock others
CREATE POLICY "message_blocks_insert_own"
  ON public.message_blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "message_blocks_delete_own"
  ON public.message_blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.user_rate_limits TO authenticated;
GRANT ALL ON public.user_rate_limits TO service_role;
GRANT SELECT, INSERT, DELETE ON public.message_blocks TO authenticated;
GRANT ALL ON public.message_blocks TO service_role;

-- ============================================================================
-- RPC FUNCTION: Check message rate limit & keywords
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_message_before_send(
  _sender_id UUID,
  _body TEXT
)
RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
  _rate_limit public.user_rate_limits;
  _flagged_keyword TEXT;
  _banned_keywords_count INTEGER;
BEGIN
  -- Fetch rate limit record (auto-create if missing)
  SELECT * INTO _rate_limit FROM public.user_rate_limits WHERE user_id = _sender_id;
  
  IF _rate_limit IS NULL THEN
    INSERT INTO public.user_rate_limits(user_id) VALUES (_sender_id)
      RETURNING * INTO _rate_limit;
  END IF;

  -- Reset daily counter if new day
  IF _rate_limit.daily_reset_at < now() THEN
    UPDATE public.user_rate_limits
      SET messages_sent_today = 0,
          daily_reset_at = now() + INTERVAL '1 day'
      WHERE user_id = _sender_id;
    _rate_limit.messages_sent_today := 0;
  END IF;

  -- Check cooldown
  IF _rate_limit.cooldown_until IS NOT NULL AND _rate_limit.cooldown_until > now() THEN
    RETURN QUERY SELECT false, 'Please wait before sending another message (cooldown active)';
    RETURN;
  END IF;

  -- Check daily limit (50 messages per day)
  IF _rate_limit.messages_sent_today >= 50 THEN
    RETURN QUERY SELECT false, 'Daily message limit reached (50). Try again tomorrow.';
    RETURN;
  END IF;

  -- Check banned keywords
  SELECT keyword INTO _flagged_keyword
    FROM public.banned_keywords
    WHERE severity = 'block'
    AND _body ILIKE '%' || keyword || '%'
    LIMIT 1;

  IF _flagged_keyword IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Message contains prohibited content: ' || _flagged_keyword;
    RETURN;
  END IF;

  -- Check for review-level keywords (log but allow)
  SELECT COUNT(*) INTO _banned_keywords_count
    FROM public.banned_keywords
    WHERE severity = 'review'
    AND _body ILIKE '%' || keyword || '%';

  IF _banned_keywords_count > 0 THEN
    -- Log this for admin review (via admin_notifications in a later phase)
    -- For now, allow but mark in metadata
  END IF;

  -- All checks passed
  RETURN QUERY SELECT true, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_message_before_send(UUID, TEXT) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Update rate limit after message sent
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_message_rate_limit(_sender_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_rate_limits
    SET messages_sent_today = messages_sent_today + 1,
        last_message_at = now(),
        cooldown_until = now() + INTERVAL '5 seconds',
        updated_at = now()
    WHERE user_id = _sender_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_message_rate_limit(UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Check if user is blocked
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_user_blocked(
  _sender_id UUID,
  _recipient_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_blocks
    WHERE blocker_id = _recipient_id
    AND blocked_id = _sender_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_blocked(UUID, UUID) TO authenticated;

-- ============================================================================
-- RPC FUNCTION: Check unread message count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_unread_message_count(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.messages
    WHERE recipient_id = _user_id
    AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_message_count(UUID) TO authenticated;

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_message_blocks_relationship
  ON public.message_blocks(blocker_id, blocked_id);
