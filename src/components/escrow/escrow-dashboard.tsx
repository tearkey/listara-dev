import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package,
  Truck,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Star,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  markEscrowShipped,
  markEscrowReceived,
  confirmEscrowSatisfied,
  initiateEscrowDispute,
  submitSellerRating,
  type EscrowTransactionWithAd,
} from "@/lib/escrow.functions";
import { EscrowTimeline } from "./escrow-timeline";
import { EscrowShippingForm } from "./escrow-shipping-form";
import { EscrowInspectionForm } from "./escrow-inspection-form";
import { EscrowDisputeForm } from "./escrow-dispute-form";
import { SellerRatingForm } from "./seller-rating-form";

interface EscrowDashboardProps {
  escrow: EscrowTransactionWithAd;
  currentUserId: string;
  onStatusChange?: () => void;
}

export function EscrowDashboard({
  escrow,
  currentUserId,
  onStatusChange,
}: EscrowDashboardProps) {
  const isBuyer = escrow.buyer_id === currentUserId;
  const isSeller = escrow.seller_id === currentUserId;

  const [showShippingForm, setShowShippingForm] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);

  const markShippedFn = useServerFn(markEscrowShipped);
  const markReceivedFn = useServerFn(markEscrowReceived);
  const confirmSatisfiedFn = useServerFn(confirmEscrowSatisfied);
  const disputeFn = useServerFn(initiateEscrowDispute);
  const ratingFn = useServerFn(submitSellerRating);

  async function handleMarkShipped(trackingNumber?: string) {
    try {
      await markShippedFn({ escrowId: escrow.id, trackingNumber });
      toast.success("Item marked as shipped!");
      setShowShippingForm(false);
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not mark as shipped");
    }
  }

  async function handleMarkReceived() {
    try {
      await markReceivedFn({ escrowId: escrow.id });
      toast.success("Item marked as received. Please inspect carefully.");
      setShowInspectionForm(true);
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not mark as received");
    }
  }

  async function handleConfirmSatisfied() {
    if (
      !window.confirm(
        "Are you sure the item is in perfect condition? This will release payment to the seller."
      )
    ) {
      return;
    }
    try {
      await confirmSatisfiedFn({ escrowId: escrow.id });
      toast.success("Payment released to seller. Great transaction!");
      setShowRatingForm(true);
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not confirm satisfaction");
    }
  }

  async function handleDispute(reason: string, evidenceUrl?: string) {
    try {
      await disputeFn({ escrowId: escrow.id, reason, evidenceUrl });
      toast.success("Dispute raised. Our team will review within 24 hours.");
      setShowDisputeForm(false);
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not raise dispute");
    }
  }

  async function handleSubmitRating(stars: number, comment?: string) {
    try {
      await ratingFn({
        escrowId: escrow.id,
        sellerId: escrow.seller_id,
        ratingStars: stars,
        comment,
      });
      toast.success("Thank you for rating this seller!");
      setShowRatingForm(false);
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit rating");
    }
  }

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-900",
    shipped: "bg-blue-100 text-blue-900",
    in_transit: "bg-purple-100 text-purple-900",
    released: "bg-green-100 text-green-900",
    refunded: "bg-red-100 text-red-900",
    disputed: "bg-orange-100 text-orange-900",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{escrow.ad?.title || "Transaction"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ID: {escrow.id.slice(0, 8)}...
          </p>
        </div>
        <Badge className={`w-fit ${statusColors[escrow.status as keyof typeof statusColors]}`}>
          {escrow.status.replace(/_/g, " ").toUpperCase()}
        </Badge>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <EscrowTimeline escrow={escrow} />
        </CardContent>
      </Card>

      {/* Item & Price Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Item Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Item Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {escrow.ad?.photos?.[0] && (
              <img
                src={escrow.ad.photos[0]}
                alt={escrow.ad.title}
                className="h-32 w-full object-cover rounded-lg"
              />
            )}
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Price:</span>
                <span className="ml-2 font-semibold">${(escrow.amount_cents / 100).toFixed(2)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Commission:</span>
                <span className="ml-2 font-semibold">{escrow.commission_percent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Party Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isBuyer ? "Seller" : "Buyer"} Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Email:</span>
                <span className="ml-2 font-mono text-sm">
                  {(isBuyer ? escrow.seller?.email : escrow.buyer?.email) || "N/A"}
                </span>
              </div>
              {isBuyer && (
                <Button variant="outline" size="sm" className="w-full">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message Seller
                </Button>
              )}
              {isSeller && (
                <Button variant="outline" size="sm" className="w-full">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message Buyer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions based on Status & Role */}
      <Tabs defaultValue="actions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="space-y-4">
          {/* Seller Actions */}
          {isSeller && escrow.status === "pending" && !showShippingForm && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-2">Ready to ship?</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Mark the item as shipped with a tracking number so the buyer knows when to expect it.
                    </p>
                    <Button onClick={() => setShowShippingForm(true)} size="sm">
                      Mark as Shipped
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showShippingForm && (
            <EscrowShippingForm
              onSubmit={handleMarkShipped}
              onCancel={() => setShowShippingForm(false)}
            />
          )}

          {/* Buyer Actions */}
          {isBuyer && escrow.status === "shipped" && !showInspectionForm && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-2">Item received?</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Mark as received to start the inspection period. You have 14 days to inspect and confirm.
                    </p>
                    <Button onClick={handleMarkReceived} size="sm">
                      Mark as Received
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showInspectionForm && (
            <EscrowInspectionForm
              escrow={escrow}
              onConfirm={handleConfirmSatisfied}
              onDispute={() => setShowDisputeForm(true)}
              onCancel={() => setShowInspectionForm(false)}
            />
          )}

          {/* Dispute Form */}
          {showDisputeForm && (
            <EscrowDisputeForm
              onSubmit={handleDispute}
              onCancel={() => setShowDisputeForm(false)}
            />
          )}

          {/* Rating Form (after release) */}
          {isBuyer && escrow.status === "released" && !showRatingForm && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Star className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-2">Rate this seller</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Help future buyers by sharing your experience with this seller.
                    </p>
                    <Button onClick={() => setShowRatingForm(true)} variant="outline" size="sm">
                      Leave Rating
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showRatingForm && (
            <SellerRatingForm
              onSubmit={handleSubmitRating}
              onCancel={() => setShowRatingForm(false)}
            />
          )}

          {/* Completion State */}
          {escrow.status === "released" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Transaction Complete</h3>
                    <p className="text-sm text-muted-foreground">
                      Payment has been released to the seller. Thank you for using Listara!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold">{escrow.status.replace(/_/g, " ")}</span>
              </div>
              {escrow.payment_received_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Received:</span>
                  <span>{new Date(escrow.payment_received_at).toLocaleDateString()}</span>
                </div>
              )}
              {escrow.shipped_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipped:</span>
                  <span>{new Date(escrow.shipped_at).toLocaleDateString()}</span>
                </div>
              )}
              {escrow.received_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received:</span>
                  <span>{new Date(escrow.received_at).toLocaleDateString()}</span>
                </div>
              )}
              {escrow.auto_release_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-Release:</span>
                  <span>{new Date(escrow.auto_release_at).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
