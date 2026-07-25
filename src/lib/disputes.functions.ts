import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "vinxi/http";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
  {
    global: { headers: { Authorization: `Bearer ${getCookie("sb-access-token")}` } },
  }
);

// ============================================================================
// Admin Dispute Operations
// ============================================================================

export const listAdminDisputes = createServerFn({
  method: "POST",
})
  .input<{ page?: number; pageSize?: number; status?: string }>()
  .handler(async ({ page = 1, pageSize = 20, status = "all" }) => {
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
        analysis,
        admin_assigned_to,
        escrow_transactions(id, buyer_id, seller_id, amount_cents, payment_received_at),
        ads(id, title, short_id),
        profiles!buyer_id(id, display_name),
        profiles!seller_id(id, display_name)
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

export const getDisputeDetail = createServerFn({
  method: "GET",
})
  .input<string>()
  .handler(async (disputeId) => {
    // Fetch dispute with full context
    const { data: dispute, error: disputeError } = await supabase
      .from("dispute_requests")
      .select(`
        id,
        escrow_id,
        reason,
        status,
        initiated_by,
        analysis,
        created_at,
        resolved_at,
        admin_decision,
        resolution_notes,
        escrow_transactions(
          id,
          buyer_id,
          seller_id,
          amount_cents,
          status,
          payment_received_at,
          shipped_at,
          received_at
        ),
        ads(id, title, short_id, price_cents)
      `)
      .eq("id", disputeId)
      .single();

    if (disputeError) throw new Error(disputeError.message);
    if (!dispute) throw new Error("Dispute not found");

    // Fetch full message thread
    const { data: threads, error: threadsError } = await supabase
      .from("message_threads")
      .select("id")
      .eq("escrow_id", dispute.escrow_id)
      .single();

    if (threadsError && threadsError.code !== "PGRST116") throw new Error(threadsError.message);

    let messages: any[] = [];
    if (threads) {
      const { data: msgs, error: msgsError } = await supabase
        .from("messages")
        .select(`
          id,
          sender_id,
          body,
          is_system_message,
          created_at,
          profiles!sender_id(id, display_name, avatar_url)
        `)
        .eq("thread_id", threads.id)
        .order("created_at", { ascending: true });

      if (msgsError) throw new Error(msgsError.message);
      messages = msgs || [];
    }

    return {
      dispute,
      messages,
      escrow: dispute.escrow_transactions?.[0],
    };
  });

export const resolveDisputeAdmin = createServerFn({
  method: "POST",
})
  .input<{ disputeId: string; decision: string; notes: string }>()
  .handler(async ({ disputeId, decision, notes }) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase.rpc("resolve_dispute", {
      _dispute_id: disputeId,
      _decision: decision,
      _resolution_notes: notes,
      _admin_id: user.id,
    });

    if (error) throw new Error(error.message);
  });

export const assignDisputeToAdmin = createServerFn({
  method: "POST",
})
  .input<{ disputeId: string; adminId: string }>()
  .handler(async ({ disputeId, adminId }) => {
    const { error } = await supabase.rpc("assign_dispute_to_admin", {
      _dispute_id: disputeId,
      _admin_id: adminId,
    });

    if (error) throw new Error(error.message);
  });

export const getDisputeStats = createServerFn({
  method: "GET",
})
  .handler(async () => {
    const { data: stats, error } = await supabase
      .from("dispute_requests")
      .select("status, COUNT(*) as count");

    if (error) throw new Error(error.message);

    const byStatus = (stats || []).reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.status] = row.count;
        return acc;
      },
      {}
    );

    return {
      pending: byStatus.pending || 0,
      reviewing: byStatus.reviewing || 0,
      resolved: byStatus.resolved || 0,
      total: Object.values(byStatus).reduce((a: number, b: number) => a + b, 0),
    };
  });

export const exportDisputesCsv = createServerFn({
  method: "POST",
})
  .input<{ status?: string }>()
  .handler(async ({ status = "all" }) => {
    let query = supabase
      .from("dispute_requests")
      .select(`
        id,
        reason,
        status,
        initiated_by,
        created_at,
        admin_decision,
        resolved_at,
        escrow_transactions(amount_cents),
        profiles!buyer_id(display_name),
        profiles!seller_id(display_name)
      `);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: disputes, error } = await query.limit(10000);
    if (error) throw new Error(error.message);

    // Generate CSV
    const headers = ["Case ID", "Reason", "Status", "Initiated By", "Created", "Decision", "Resolved", "Amount", "Buyer", "Seller"];
    const rows = (disputes || []).map((d: any) => [
      d.id.slice(0, 8),
      d.reason,
      d.status,
      d.initiated_by,
      new Date(d.created_at).toLocaleDateString(),
      d.admin_decision || "-",
      d.resolved_at ? new Date(d.resolved_at).toLocaleDateString() : "-",
      `$${(d.escrow_transactions?.[0]?.amount_cents || 0) / 100}`,
      d.profiles?.[0]?.display_name || "Unknown",
      d.profiles?.[1]?.display_name || "Unknown",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r: any) =>
        r.map((cell: any) => (typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell)).join(",")
      ),
    ].join("\n");

    return {
      csv,
      filename: `disputes_${status}_${new Date().toISOString().split("T")[0]}.csv`,
    };
  });
