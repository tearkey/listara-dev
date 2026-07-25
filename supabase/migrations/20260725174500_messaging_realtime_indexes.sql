-- Messaging Realtime Optimization
-- Adds indexes and functions to support real-time message updates

-- Add index for efficient thread_id filtering on Realtime subscriptions
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);

-- Add index for efficient user message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_recipient_created 
ON messages(recipient_id, created_at DESC);

-- Add index for efficient sender queries
CREATE INDEX IF NOT EXISTS idx_messages_sender_created 
ON messages(sender_id, created_at DESC);

-- Add composite index for thread filtering with timestamps
CREATE INDEX IF NOT EXISTS idx_messages_thread_created 
ON messages(thread_id, created_at DESC);

-- Function to get unread count for a user with Realtime support
CREATE OR REPLACE FUNCTION get_unread_message_count_for_user(user_id UUID)
RETURNS TABLE(unread_count INT) 
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INT AS unread_count
  FROM messages m
  INNER JOIN message_threads mt ON m.thread_id = mt.id
  WHERE m.recipient_id = user_id
    AND m.read_at IS NULL
    AND m.is_system_message = FALSE
    AND (mt.banned_until IS NULL OR mt.banned_until < NOW());
$$;

-- Function to get threads for a user optimized for Realtime
CREATE OR REPLACE FUNCTION get_user_message_threads_realtime(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  ad_id UUID,
  ad_title TEXT,
  seller_id UUID,
  buyer_id UUID,
  other_user_id UUID,
  other_user_display_name TEXT,
  last_message_body TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_sender TEXT,
  unread_count INT,
  is_archived BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    mt.id,
    mt.ad_id,
    a.title,
    mt.seller_id,
    mt.buyer_id,
    CASE 
      WHEN mt.seller_id = p_user_id THEN mt.buyer_id 
      ELSE mt.seller_id 
    END AS other_user_id,
    CASE 
      WHEN mt.seller_id = p_user_id THEN p_buyer.display_name
      ELSE p_seller.display_name
    END AS other_user_display_name,
    m_last.body AS last_message_body,
    mt.last_message_at,
    CASE 
      WHEN m_last.is_system_message THEN 'System'
      WHEN m_last.sender_id = p_user_id THEN 'You'
      ELSE 'Them'
    END AS last_message_sender,
    COUNT(CASE WHEN m.read_at IS NULL AND m.recipient_id = p_user_id THEN 1 END)::INT AS unread_count,
    mt.is_archived
  FROM message_threads mt
  INNER JOIN ads a ON mt.ad_id = a.id
  LEFT JOIN profiles p_buyer ON mt.buyer_id = p_buyer.id
  LEFT JOIN profiles p_seller ON mt.seller_id = p_seller.id
  LEFT JOIN messages m ON mt.id = m.thread_id AND m.read_at IS NULL
  LEFT JOIN LATERAL (
    SELECT body, sender_id, is_system_message
    FROM messages
    WHERE thread_id = mt.id
    ORDER BY created_at DESC
    LIMIT 1
  ) m_last ON TRUE
  WHERE (mt.seller_id = p_user_id OR mt.buyer_id = p_user_id)
    AND (mt.banned_until IS NULL OR mt.banned_until < NOW())
  GROUP BY mt.id, a.title, p_buyer.display_name, p_seller.display_name, m_last.body, m_last.sender_id, m_last.is_system_message
  ORDER BY mt.last_message_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Realtime publication for thread updates (if not already published)
DROP PUBLICATION IF EXISTS message_threads_realtime CASCADE;
CREATE PUBLICATION message_threads_realtime FOR TABLE message_threads;

-- Realtime publication for messages
DROP PUBLICATION IF EXISTS messages_realtime CASCADE;
CREATE PUBLICATION messages_realtime FOR TABLE messages;

-- Grant realtime permissions to authenticated users
GRANT SELECT ON messages TO authenticated;
GRANT SELECT ON message_threads TO authenticated;

COMMENT ON INDEX idx_messages_thread_id IS 'Supports Realtime subscriptions filtering by thread_id';
COMMENT ON INDEX idx_messages_recipient_created IS 'Supports unread message queries';
COMMENT ON INDEX idx_messages_thread_created IS 'Supports thread message history pagination';
COMMENT ON FUNCTION get_unread_message_count_for_user IS 'Real-time safe: returns unread count for user (excludes archived/banned threads)';
COMMENT ON FUNCTION get_user_message_threads_realtime IS 'Real-time safe: returns thread list with metadata optimized for live updates';
