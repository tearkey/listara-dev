import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EscrowShippingFormProps {
  onSubmit: (trackingNumber?: string) => Promise<void>;
  onCancel: () => void;
}

export function EscrowShippingForm({ onSubmit, onCancel }: EscrowShippingFormProps) {
  const [carrier, setCarrier] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const fullTracking = carrier && trackingNumber ? `${carrier}:${trackingNumber}` : trackingNumber;
      await onSubmit(fullTracking || undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="text-base">Mark Item as Shipped</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="carrier">Shipping Carrier (optional)</Label>
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger id="carrier">
              <SelectValue placeholder="Select carrier..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usps">USPS</SelectItem>
              <SelectItem value="fedex">FedEx</SelectItem>
              <SelectItem value="ups">UPS</SelectItem>
              <SelectItem value="dhl">DHL</SelectItem>
              <SelectItem value="local">Local Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tracking">Tracking Number (optional)</Label>
          <Input
            id="tracking"
            placeholder="e.g., 1Z999AA10123456784"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Provide a tracking number so the buyer can monitor delivery.
          </p>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? "Submitting..." : "Mark as Shipped"}
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
