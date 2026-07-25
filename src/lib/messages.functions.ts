import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "vinxi/http";
import { createClient } from "@supabase/supabase-js";

type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
  {
    global: { headers: { Authorization: `Bearer ${getCookie("sb-access-token")}` } },
  }
);

// ============================================================================
// Message Thread Operations
// ============================================================================

export const getOrCreateMessageThread = createServerFn({
  method: "POST",
})
  .input<{ adId: string; sellerId: string; buyerId: string }>()
  .handler(async ({ adId, sellerId, buyerId }) => {
    const { data, error } = await supabase.rpc(
      "get_or_create_message_thread",
      { _ad_id: adId, _seller_id: sellerId, _buyer_id: buyerId }
    );
    if (error) throw new Error(error.message);
    return { threadId: data as string };
  });

export const listUserThreads = createServerFn({
  method: "POST",
})
  .input<{ page?: number; pageSize?: number }>()
  .handler(async ({ page = 1, pageSize = 20 }) => {
    const offset = (page - 1) * pageSize;

    const { data: threads, error } = await supabase
      .from("message_threads")
      .select(`
        id,
        ad_id,
        escrow_id,
        seller_id,
        buyer_id,
        last_message_at,
        is_archived,
        created_at,
        ads(id, short_id, title, slug),
        profiles!seller_id(id, display_name, avatar_url),
        profiles!buyer_id(id, display_name, avatar_url)
      `)
      .or(`seller_id.eq.${supabase.auth.getUser()},buyer_id.eq.${supabase.auth.getUser()}`)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from("message_threads")
      .select("*", { count: "exact", head: true })
      .or(`seller_id.eq.${supabase.auth.getUser()},buyer_id.eq.${supabase.auth.getUser()}`)
      .eq("is_archived", false);

    return {
      threads: threads || [],
      total: count || 0,
      pageSize,
    };
  });

export const getThreadDetail = createServerFn({
  method: "GET",
})
  .input<string>()
  .handler(async (threadId) => {
    const { data: thread, error } = await supabase
      .from("message_threads")
      .select(`
        id,
        ad_id,
        escrow_id,
        seller_id,
        buyer_id,
        last_message_at,
        is_archived,
        created_at,
        ads(id, short_id, title, slug, price_cents, currency),
        escrow_transactions(id, status, amount_cents, payment_received_at),
        profiles!seller_id(id, display_name, avatar_url, reputation),
        profiles!buyer_id(id, display_name, avatar_url, reputation)
      `)
      .eq("id", threadId)
      .single();

    if (error) throw new Error(error.message);
    if (!thread) throw new Error("Thread not found");

    return thread;
  });

// ============================================================================
// Message Operations
// ============================================================================

export const sendThreadMessage = createServerFn({
  method: "POST",
})
  .input<{ threadId: string; body: string; metadata?: Record<string, any> }>()
  .handler(async ({ threadId, body, metadata = {} }) => {
    const { data: messageId, error } = await supabase.rpc("send_thread_message", {
      _thread_id: threadId,
      _body: body,
      _metadata: metadata,
    });

    if (error) throw new Error(error.message);
    return { messageId };
  });

export const listThreadMessages = createServerFn({
  method: "POST",
})
  .input<{ threadId: string; page?: number; pageSize?: number }>()
  .handler(async ({ threadId, page = 1, pageSize = 30 }) => {
    const offset = (page - 1) * pageSize;

    const { data: messages, error } = await supabase
      .from("messages")
      .select(`
        id,
        thread_id,
        sender_id,
        recipient_id,
        body,
        is_system_message,
        metadata,
        read_at,
        created_at,
        profiles!sender_id(id, display_name, avatar_url)
      `)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    // Reverse to get chronological order
    return {
      messages: (messages || []).reverse(),
      pageSize,
    };
  });

export const markThreadAsRead = createServerFn({
  method: "POST",
})
  .input<string>()
  .handler(async (threadId) => {
    const { error } = await supabase.rpc("mark_thread_messages_read", {
      _thread_id: threadId,
    });

    if (error) throw new Error(error.message);
  });

export const getUnreadMessageCount = createServerFn({
  method: "GET",
})
  .handler(async () => {
    const { data: count, error } = await supabase.rpc(
      "get_unread_message_count",
      { _user_id: (await supabase.auth.getUser()).data.user?.id }
    );

    if (error) throw new Error(error.message);
    return count as number;
  });

// ============================================================================
// Rate Limiting & Validation
// ============================================================================

export const validateMessageBeforeSend = createServerFn({
  method: "POST",
})
  .input<{ body: string }>()
  .handler(async ({ body }) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    const { data: result, error } = await supabase.rpc(
      "validate_message_before_send",
      { _sender_id: user.id, _body: body }
    );

    if (error) throw new Error(error.message);
    return result as { allowed: boolean; reason?: string };
  });

// ============================================================================
// Message Blocking
// ============================================================================

export const blockUser = createServerFn({
  method: "POST",
})
  .input<string>()
  .handler(async (userId) => {
    const { error } = await supabase.from("message_blocks").insert({
      blocker_id: (await supabase.auth.getUser()).data.user?.id,
      blocked_id: userId,
    });

    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  });

export const unblockUser = createServerFn({
  method: "POST",
})
  .input<string>()
  .handler(async (userId) => {
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase
      .from("message_blocks")
      .delete()
      .eq("blocker_id", user?.id)
      .eq("blocked_id", userId);

    if (error) throw new Error(error.message);
  });

export const checkIsBlocked = createServerFn({
  method: "POST",
})
  .input<{ senderId: string; recipientId: string }>()
  .handler(async ({ senderId, recipientId }) => {
    const { data: blocked, error } = await supabase.rpc("is_user_blocked", {
      _sender_id: senderId,
      _recipient_id: recipientId,
    });

    if (error) throw new Error(error.message);
    return blocked as boolean;
  });

// ============================================================================
// Dispute Operations (Phase 2A)
// ============================================================================

export const raiseDisputeFromThread = createServerFn({
  method: "POST",
})
  .input<{ threadId: string; reason: string; evidenceUrls?: string[] }>()
  .handler(async ({ threadId, reason, evidenceUrls = [] }) => {
    const { data: disputeId, error } = await supabase.rpc(
      "raise_dispute_from_thread",
      {
        _thread_id: threadId,
        _reason: reason,
        _evidence_urls: evidenceUrls,
      }
    );

    if (error) throw new Error(error.message);
    return { disputeId };
  });

export const detectDisputeTrigger = createServerFn({
  method: "POST",
})
  .input<{ threadId: string; escrowId: string }>()
  .handler(async ({ threadId, escrowId }) => {
    const { data: result, error } = await supabase.rpc("detect_dispute_trigger", {
      _thread_id: threadId,
      _escrow_id: escrowId,
    });

    if (error) throw new Error(error.message);
    return result as {
      trigger_found: boolean;
      keyword_count: number;
      flagged_keywords: string[];
      summary: string;
    };
  });

export const validateEscrowIsPaid = createServerFn({
  method: "POST",
})
  .input<string>()
  .handler(async (escrowId) => {
    const { data: result, error } = await supabase.rpc("validate_escrow_is_paid", {
      _escrow_id: escrowId,
    });

    if (error) throw new Error(error.message);
    return result as { is_valid: boolean; reason?: string };
  });

export const listUserDisputeRequests = createServerFn({
  method: "POST",
})
  .input<{ page?: number; pageSize?: number; status?: string }>()
  .handler(async ({ page = 1, pageSize = 20, status = "pending" }) => {
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from("dispute_requests")
      .select(`
        id,
        escrow_id,
        reason,
        status,
        initiated_by,
        created_at,
        escrow_transactions(id, buyer_id, seller_id, amount_cents),
        ads(id, title, short_id)
      `);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: disputes, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from("dispute_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", status !== "all" ? status : undefined);

    return {
      disputes: disputes || [],
      total: count || 0,
      pageSize,
    };
  });
