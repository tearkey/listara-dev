import { useQuery, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrCreateMessageThread,
  listUserThreads,
  getThreadDetail,
  sendThreadMessage,
  listThreadMessages,
  markThreadAsRead,
  getUnreadMessageCount,
  validateMessageBeforeSend,
  raiseDisputeFromThread,
  validateEscrowIsPaid,
  blockUser,
  unblockUser,
} from "./messages.functions";
import { toast } from "sonner";

// ============================================================================
// Query Options
// ============================================================================

export const messageThreadsQueryOpts = (page: number = 1, pageSize: number = 20) => ({
  queryKey: ["messages", "threads", page, pageSize],
  queryFn: () => listUserThreads({ page, pageSize }),
});

export const threadDetailQueryOpts = (threadId: string) => ({
  queryKey: ["messages", "thread", threadId],
  queryFn: () => getThreadDetail(threadId),
});

export const threadMessagesQueryOpts = (threadId: string, page: number = 1, pageSize: number = 30) => ({
  queryKey: ["messages", "thread", threadId, "messages", page],
  queryFn: () => listThreadMessages({ threadId, page, pageSize }),
});

export const unreadCountQueryOpts = () => ({
  queryKey: ["messages", "unread-count"],
  queryFn: () => getUnreadMessageCount(),
  refetchInterval: 30000, // Poll every 30 seconds (or use Realtime)
});

// ============================================================================
// Hooks
// ============================================================================

export function useMessageThreads(page: number = 1, pageSize: number = 20) {
  return useSuspenseQuery(messageThreadsQueryOpts(page, pageSize));
}

export function useThreadDetail(threadId: string) {
  return useSuspenseQuery(threadDetailQueryOpts(threadId));
}

export function useThreadMessages(threadId: string, page: number = 1, pageSize: number = 30) {
  return useSuspenseQuery(threadMessagesQueryOpts(threadId, page, pageSize));
}

export function useUnreadCount() {
  return useQuery(unreadCountQueryOpts());
}

// ============================================================================
// Mutations
// ============================================================================

export function useGetOrCreateThread() {
  const qc = useQueryClient();
  const getOrCreate = useServerFn(getOrCreateMessageThread);

  return useMutation({
    mutationFn: ({ adId, sellerId, buyerId }: { adId: string; sellerId: string; buyerId: string }) =>
      getOrCreate({ data: { adId, sellerId, buyerId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const send = useServerFn(sendThreadMessage);

  return useMutation({
    mutationFn: ({ threadId, body, metadata }: { threadId: string; body: string; metadata?: Record<string, any> }) =>
      send({ data: { threadId, body, metadata } }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: ["messages", "thread", threadId, "messages"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send message");
    },
  });
}

export function useMarkThreadAsRead() {
  const markRead = useServerFn(markThreadAsRead);

  return useMutation({
    mutationFn: (threadId: string) => markRead(threadId),
    onError: (err: any) => {
      toast.error(err.message || "Failed to mark as read");
    },
  });
}

export function useValidateMessage() {
  const validate = useServerFn(validateMessageBeforeSend);

  return useMutation({
    mutationFn: (body: string) => validate({ data: { body } }),
    onError: (err: any) => {
      toast.error(err.message || "Message validation failed");
    },
  });
}

export function useRaiseDispute() {
  const qc = useQueryClient();
  const raise = useServerFn(raiseDisputeFromThread);

  return useMutation({
    mutationFn: ({ threadId, reason, evidenceUrls }: { threadId: string; reason: string; evidenceUrls?: string[] }) =>
      raise({ data: { threadId, reason, evidenceUrls } }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: ["messages", "thread", threadId, "messages"] });
      toast.success("Dispute raised. Admin will review shortly.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to raise dispute");
    },
  });
}

export function useValidateEscrowPaid() {
  const validate = useServerFn(validateEscrowIsPaid);

  return useMutation({
    mutationFn: (escrowId: string) => validate(escrowId),
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  const block = useServerFn(blockUser);

  return useMutation({
    mutationFn: (userId: string) => block(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      toast.success("User blocked");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to block user");
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  const unblock = useServerFn(unblockUser);

  return useMutation({
    mutationFn: (userId: string) => unblock(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      toast.success("User unblocked");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to unblock user");
    },
  });
}
