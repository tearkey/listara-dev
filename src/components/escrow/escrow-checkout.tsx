import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createEscrow, calculateEscrowBreakdown, type EscrowTransaction } from "@/lib/escrow.functions";

interface Ad {
  id: string;
  title: string;
  price_cents: number;
  body: string;
  photos?: string[];
  condition_type?: string;
  created_at?: string;
  seller_id: string;
  seller?: {
    display_name?: string;
    avatar_url?: string;
    electronics_avg_rating?: number;
    electronics_sales_count?: number;
  };
}

interface EscrowCheckoutProps {
  ad: Ad;
  onSuccess?: (escrowId: string) => void;
}

export function EscrowCheckout({ ad, onSuccess }: EscrowCheckoutProps) {
  const navigate = useNavigate();
  const createEscrowFn = useServerFn(createEscrow);
  const [processing, setProcessing] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const breakdown = calculateEscrowBreakdown({
    itemPriceCents: ad.price_cents,
  });

  async function handleCheckout() {
    if (!agreeToTerms) {
      toast.error("Please agree to the escrow terms");
      return;
    }

    setProcessing(true);
    try {
      // In production, integrate with Stripe here:
      // 1. Create Stripe payment intent
      // 2. Confirm payment with card
      // 3. Only call createEscrow after payment succeeds

      const { escrowId } = await createEscrowFn({
        adId: ad.id,
        sellerId: ad.seller_id,
        amountCents: breakdown.totalCents,
      });

      toast.success("Purchase confirmed! Seller will ship the item.");
      onSuccess?.(escrowId);
      navigate({ to: `/dashboard/escrow/${escrowId}` });
    } catch (e: any) {
      toast.error(e.message ?? "Could not complete purchase");
    } finally {
      setProcessing(false);
    }
  }

  const conditionBadgeVariant = {
    pristine: "bg-green-100 text-green-900",
    excellent: "bg-green-50 text-green-800",
    good: "bg-blue-50 text-blue-800",
    fair: "bg-yellow-50 text-yellow-800",
    needs_repair: "bg-red-50 text-red-800",
  }[ad.condition_type || "good"] || "bg-gray-50 text-gray-800";

  return (
    <div className="space-y-6">
      {/* Item Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{ad.title}</CardTitle>
          {ad.condition_type && (
            <Badge className={`w-fit mt-2 ${conditionBadgeVariant}`}>
              {ad.condition_type.charAt(0).toUpperCase() + ad.condition_type.slice(1).replace(/_/g, " ")}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {ad.photos?.[0] && (
            <img
              src={ad.photos[0]}
              alt={ad.title}
              className="h-48 w-full object-cover rounded-lg"
            />
          )}
          <p className="text-sm text-muted-foreground line-clamp-3">{ad.body}</p>

          {/* Seller Info */}
          <div className="pt-4 border-t">
            <div className="text-sm font-semibold mb-2">Sold by</div>
            <div className="flex items-center gap-3">
              {ad.seller?.avatar_url && (
                <img
                  src={ad.seller.avatar_url}
                  alt={ad.seller.display_name}
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div>
                <div className="font-medium text-sm">{ad.seller?.display_name || "Seller"}</div>
                {ad.seller?.electronics_avg_rating && (
                  <div className="text-xs text-muted-foreground">
                    ★ {ad.seller.electronics_avg_rating.toFixed(1)} ({ad.seller.electronics_sales_count} sales)
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Escrow Guarantee */}
      <Alert className="border-green-200 bg-green-50">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900">Escrow Protection Included</AlertTitle>
        <AlertDescription className="text-green-800 text-sm">
          Your payment is held securely until you confirm the item meets your expectations. If there's
          any issue, you can request a refund or escalate to our support team.
        </AlertDescription>
      </Alert>

      {/* Price Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Price Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Item price</span>
            <span className="font-medium">{breakdown.breakdown.item}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Commission ({breakdown.commissionPercent}%)</span>
            <span>{breakdown.breakdown.commission}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Escrow fee</span>
            <span>{breakdown.breakdown.escrowFee}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{breakdown.breakdown.total}</span>
          </div>
        </CardContent>
      </Card>

      {/* How Escrow Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How Escrow Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[
              {
                step: 1,
                title: "Payment Held",
                description: "Your payment is securely held by us, not given to the seller yet.",
              },
              {
                step: 2,
                title: "Seller Ships",
                description: "Seller packages and ships the item with tracking number.",
              },
              {
                step: 3,
                title: "You Inspect",
                description: "You receive and inspect the item (usually 3-5 business days).",
              },
              {
                step: 4,
                title: "Confirm or Dispute",
                description: "If everything looks good, confirm satisfaction and we release the payment.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  {item.step}
                </div>
                <div>
                  <div className="font-medium text-sm">{item.title}</div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security & Terms */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold mb-1">Secure Payment</div>
              <p className="text-muted-foreground">
                All payments are processed securely through Stripe and held in escrow until you confirm satisfaction.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold mb-1">Dispute Resolution</div>
              <p className="text-muted-foreground">
                If there's any issue with the item, you can raise a dispute and our team will help resolve it.
              </p>
            </div>
          </div>

          <Separator />

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeToTerms}
              onChange={(e) => setAgreeToTerms(e.target.checked)}
              className="mt-1"
            />
            <span className="text-xs text-muted-foreground">
              I understand and agree to the escrow terms. I will inspect the item carefully and confirm satisfaction
              or raise a dispute within 14 days.
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Action */}
      <Button
        onClick={handleCheckout}
        disabled={!agreeToTerms || processing}
        size="lg"
        className="w-full"
      >
        {processing ? "Processing..." : `Buy Now — ${breakdown.breakdown.total}`}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        By clicking "Buy Now", you agree to our escrow terms and privacy policy.
      </p>
    </div>
  );
}
