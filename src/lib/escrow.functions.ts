import { createServerFn } from "@tanstack/react-start/server";
import { supabaseAdmin, supabaseClient } from "@/utils/supabase";

// Types
export type EscrowStatus = "pending" | "shipped" | "in_transit" | "released" | "refunded" | "disputed";

export interface EscrowTransaction {
  id: string;
  ad_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  commission_percent: number;
  status: EscrowStatus;
  payment_method: string;
  payment_id?: string;
  payment_received_at?: string;
  shipped_at?: string;
  received_at?: string;
  confirmed_satisfied_at?: string;
  released_at?: string;
  refunded_at?: string;
  auto_release_at?: string;
  notes?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EscrowTransactionWithAd extends EscrowTransaction {
  ad?: {
    id: string;
    title: string;
    price_cents: number;
    body: string;
    photos?: string[];
    seller?: {
      id: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
}

export interface SellerRating {
  id: string;
  escrow_id: string;
  buyer_id: string;
  seller_id: string;
  rating_stars: number;
  comment?: string;
  aspects?: Record<string, any>;
  created_at: string;
}

// ============================================================================
// SERVER FUNCTIONS FOR ESCROW OPERATIONS
// ============================================================================

/**
 * Fetch escrow transaction with related ad and parties
 */
export const getEscrowTransaction = createServerFn(
  { method: "POST" },
  async ({ escrowId }: { escrowId: string }) => {
    const { data, error } = await supabaseClient
      .from("escrow_transactions")
      .select(`
        *,
        ad:ads(id, title, price_cents, body, photos, seller_id),
        buyer:auth.users!buyer_id(id, email),
        seller:auth.users!seller_id(id, email)
      `)
      .eq("id", escrowId)
      .single();

    if (error) throw new Error(error.message);
    return data as EscrowTransactionWithAd;
  }
);

/**
 * List user's escrow transactions (as buyer or seller)
 */
export const listUserEscrows = createServerFn(
  { method: "POST" },
  async ({
    role = "buyer",
    status,
    limit = 20,
    offset = 0,
  }: {
    role?: "buyer" | "seller";
    status?: EscrowStatus;
    limit?: number;
    offset?: number;
  }) => {
    let query = supabaseClient
      .from("escrow_transactions")
      .select(
        `*,
        ad:ads(id, title, price_cents, body, photos),
        buyer:auth.users!buyer_id(id, email),
        seller:auth.users!seller_id(id, email)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (role === "buyer") {
      query = query.eq("buyer_id", supabaseClient.auth.session?.user?.id);
    } else {
      query = query.eq("seller_id", supabaseClient.auth.session?.user?.id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);
    return { escrows: (data as EscrowTransactionWithAd[]) || [], total: count || 0 };
  }
);

/**
 * Create escrow transaction after payment is confirmed
 */
export const createEscrow = createServerFn(
  { method: "POST" },
  async ({
    adId,
    sellerId,
    amountCents,
  }: {
    adId: string;
    sellerId: string;
    amountCents: number;
  }) => {
    const userId = supabaseClient.auth.session?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    // Call RPC function to create escrow atomically
    const { data, error } = await supabaseClient.rpc("create_escrow_transaction", {
      _ad_id: adId,
      _buyer_id: userId,
      _seller_id: sellerId,
      _amount_cents: amountCents,
    });

    if (error) throw new Error(error.message);
    return { escrowId: data };
  }
);

/**
 * Mark escrow as shipped (seller action)
 */
export const markEscrowShipped = createServerFn(
  { method: "POST" },
  async ({
    escrowId,
    trackingNumber,
  }: {
    escrowId: string;
    trackingNumber?: string;
  }) => {
    const { error } = await supabaseClient.rpc("escrow_mark_shipped", {
      _escrow_id: escrowId,
      _tracking_number: trackingNumber,
    });

    if (error) throw new Error(error.message);
  }
);

/**
 * Mark escrow as received (buyer action)
 */
export const markEscrowReceived = createServerFn(
  { method: "POST" },
  async ({ escrowId }: { escrowId: string }) => {
    const { error } = await supabaseClient.rpc("escrow_mark_received", {
      _escrow_id: escrowId,
    });

    if (error) throw new Error(error.message);
  }
);

/**
 * Confirm buyer is satisfied (buyer action)
 */
export const confirmEscrowSatisfied = createServerFn(
  { method: "POST" },
  async ({ escrowId }: { escrowId: string }) => {
    const { error } = await supabaseClient.rpc("escrow_confirm_satisfied", {
      _escrow_id: escrowId,
    });

    if (error) throw new Error(error.message);
  }
);

/**
 * Initiate dispute on escrow
 */
export const initiateEscrowDispute = createServerFn(
  { method: "POST" },
  async ({
    escrowId,
    reason,
    evidenceUrl,
  }: {
    escrowId: string;
    reason: string;
    evidenceUrl?: string;
  }) => {
    const { error } = await supabaseClient.rpc("escrow_initiate_dispute", {
      _escrow_id: escrowId,
      _reason: reason,
      _evidence_url: evidenceUrl,
    });

    if (error) throw new Error(error.message);
  }
);

/**
 * Submit seller rating after transaction
 */
export const submitSellerRating = createServerFn(
  { method: "POST" },
  async ({
    escrowId,
    sellerId,
    ratingStars,
    comment,
    aspects,
  }: {
    escrowId: string;
    sellerId: string;
    ratingStars: number;
    comment?: string;
    aspects?: Record<string, boolean>;
  }) => {
    const userId = supabaseClient.auth.session?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const { error } = await supabaseClient.from("seller_ratings").insert({
      escrow_id: escrowId,
      buyer_id: userId,
      seller_id: sellerId,
      rating_stars: Math.min(5, Math.max(1, ratingStars)),
      comment: comment || null,
      aspects: aspects || {},
    });

    if (error) throw new Error(error.message);
  }
);

/**
 * Get seller ratings and average
 */
export const getSellerRatings = createServerFn(
  { method: "POST" },
  async ({ sellerId, limit = 10 }: { sellerId: string; limit?: number }) => {
    const { data: ratings, error } = await supabaseClient
      .from("seller_ratings")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const avgRating =
      ratings && ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating_stars, 0) / ratings.length
        : 0;

    return {
      ratings: (ratings as SellerRating[]) || [],
      averageRating: parseFloat(avgRating.toFixed(1)),
      totalRatings: ratings?.length || 0,
    };
  }
);

/**
 * Calculate escrow price breakdown
 */
export const calculateEscrowBreakdown = ({
  itemPriceCents,
  commissionPercent = 8,
}: {
  itemPriceCents: number;
  commissionPercent?: number;
}) => {
  const commissionCents = Math.round((itemPriceCents * commissionPercent) / 100);
  const escrowFeeCents = Math.max(100, Math.round(itemPriceCents * 0.01)); // 1% fee, min $1
  const totalCents = itemPriceCents + commissionCents + escrowFeeCents;

  return {
    itemPriceCents,
    commissionCents,
    commissionPercent,
    escrowFeeCents,
    totalCents,
    breakdown: {
      item: `$${(itemPriceCents / 100).toFixed(2)}`,
      commission: `$${(commissionCents / 100).toFixed(2)} (${commissionPercent}%)`,
      escrowFee: `$${(escrowFeeCents / 100).toFixed(2)}`,
      total: `$${(totalCents / 100).toFixed(2)}`,
    },
  };
};
