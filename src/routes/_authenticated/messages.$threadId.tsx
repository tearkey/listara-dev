import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, AlertCircle, Flag, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  threadDetailQueryOpts,
  threadMessagesQueryOpts,
  useSendMessage,
  useMarkThreadAsRead,
  useRaiseDispute,
  useValidateEscrowPaid,
} from "@/lib/messages.hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, formatDate } from "date-fns";

export const Route = createFileRoute("/_authenticated/messages/$threadId")({
  head: ({ params }) => ({
    meta: [
      { title: `Message Thread - ${params.threadId}` },
    ],
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(threadDetailQueryOpts(params.threadId)),
      context.queryClient.ensureQueryData(threadMessagesQueryOpts(params.threadId, 1, 30)),
    ]),
  component: ThreadDetailPage,
});

function ThreadDetailPage() {
  const { threadId } = Route.useParams();
  const [messageBody, setMessageBody] = useState("");
  const [isDisputeDialogOpen, setIsDisputeDialogOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("item_not_received");
  const [disputeEvidence, setDisputeEvidence] = useState("");

  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: thread } = useSuspenseQuery(threadDetailQueryOpts(threadId));
  const { data: messagesPage } = useSuspenseQuery(threadMessagesQueryOpts(threadId, 1, 30));

  const sendMutation = useSendMessage();
  const markReadMutation = useMarkThreadAsRead();
  const raiseMutation = useRaiseDispute();
  const validateEscrow = useValidateEscrowPaid();

  const messages = messagesPage?.messages || [];
  const escrow = thread?.escrow_transactions?.[0];
  const otherProfile =
    thread?.seller_id === thread?.profiles?.[0]?.id
      ? thread?.profiles?.[1]
      : thread?.profiles?.[0];

  // Mark thread as read when viewing
  useEffect(() => {
    markReadMutation.mutate(threadId);
    qc.invalidateQueries({ queryKey: ["messages", "unread-count"] });
  }, [threadId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage() {
    if (!messageBody.trim()) return;

    try {
      await sendMutation.mutateAsync({
        threadId,
        body: messageBody,
      });
      setMessageBody("");
    } catch (e) {
      // Error already shown in mutation
    }
  }

  async function handleRaiseDispute() {
    if (!disputeReason) {
      toast.error("Please select a dispute reason");
      return;
    }

    const evidenceUrls = disputeEvidence
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url);

    try {
      await raiseMutation.mutateAsync({
        threadId,
        reason: disputeReason,
        evidenceUrls,
      });
      setIsDisputeDialogOpen(false);
      setDisputeReason("item_not_received");
      setDisputeEvidence("");
    } catch (e) {
      // Error already shown in mutation
    }
  }

  async function checkCanRaise() {
    if (!escrow?.id) {
      toast.error("No active transaction. Disputes require a completed payment.");
      return;
    }

    try {
      const result = await validateEscrow.mutateAsync(escrow.id);
      if (!result?.is_valid) {
        toast.error(result?.reason || "Cannot raise dispute for this transaction");
      }
    } catch (e: any) {
      toast.error(e.message || "Cannot raise dispute");
    }
  }

  const canRaiseDispute = !!escrow && escrow.payment_received_at;
  const disputeExists = messages.some((m) => m.metadata?.dispute_id);

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">
              {thread?.ads?.title || "Unknown Item"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {otherProfile?.display_name || "Unknown User"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {escrow && (
              <div
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                  escrow.payment_received_at
                    ? "bg-green/10 text-green"
                    : "bg-yellow/10 text-yellow"
                }`}
              >
                <Lock className="h-3 w-3" />
                {escrow.payment_received_at ? "Escrow Active" : "Pending Payment"}
              </div>
            )}

            {/* Raise Dispute Button */}
            {!disputeExists && canRaiseDispute && (
              <Dialog open={isDisputeDialogOpen} onOpenChange={setIsDisputeDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={checkCanRaise}
                    className="gap-2"
                  >
                    <Flag className="h-4 w-4" />
                    Raise Dispute
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Raise a Dispute</DialogTitle>
                    <DialogDescription>
                      Describe the issue with this transaction. Our team will review and
                      determine the appropriate resolution.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Reason</label>
                      <Select value={disputeReason} onValueChange={setDisputeReason}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="item_not_received">Item not received</SelectItem>
                          <SelectItem value="item_defective">Item defective / damaged</SelectItem>
                          <SelectItem value="not_as_described">Not as described</SelectItem>
                          <SelectItem value="seller_unresponsive">Seller unresponsive</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Evidence URLs (optional)</label>
                      <p className="text-xs text-muted-foreground mt-1 mb-2">
                        Paste URLs to photos, screenshots, or other evidence (one per line)
                      </p>
                      <Textarea
                        value={disputeEvidence}
                        onChange={(e) => setDisputeEvidence(e.target.value)}
                        placeholder="https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setIsDisputeDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRaiseDispute}
                        disabled={raiseMutation.isPending}
                      >
                        {raiseMutation.isPending ? "Submitting..." : "Submit Dispute"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {!canRaiseDispute && escrow && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Disputes available after payment
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <MessageCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          </div>
        ) : (
          messages.map((message: any) => (
            <div
              key={message.id}
              className={`flex ${message.is_system_message ? "justify-center" : message.sender_id === thread?.buyer_id ? "justify-end" : "justify-start"}`}
            >
              {message.is_system_message ? (
                <div className="flex max-w-xs items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  {message.body}
                </div>
              ) : (
                <div className={`flex max-w-xs gap-2 ${message.sender_id === thread?.buyer_id ? "flex-row-reverse" : ""}`}>
                  <img
                    src={message.profiles?.avatar_url || ""}
                    alt={message.profiles?.display_name}
                    className="h-8 w-8 rounded-full bg-muted"
                  />
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      message.sender_id === thread?.buyer_id
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="text-sm">{message.body}</p>
                    <p className={`text-xs mt-1 ${message.sender_id === thread?.buyer_id ? "opacity-75" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(message.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card p-4">
        <div className="flex gap-2">
          <Textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message… (Shift+Enter for new line)"
            className="resize-none"
            rows={2}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageBody.trim() || sendMutation.isPending}
            size="icon"
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💬 Keep all negotiations on Listara. Never share personal contact info to stay protected.
        </p>
      </div>
    </div>
  );
}
