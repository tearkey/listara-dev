import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EscrowDisputeFormProps {
  onSubmit: (reason: string, evidenceUrl?: string) => Promise<void>;
  onCancel: () => void;
}

export function EscrowDisputeForm({ onSubmit, onCancel }: EscrowDisputeFormProps) {
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason) return;

    setSubmitting(true);
    try {
      await onSubmit(reason, description || undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="text-base text-red-900">Raise a Dispute</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-red-200 bg-red-100">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-900">Please describe the issue</AlertTitle>
          <AlertDescription className="text-red-800 text-sm">
            Our team will review your dispute within 24 hours. Provide as much detail as possible
            to help us resolve this quickly.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="reason">What's the problem? *</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="reason">
              <SelectValue placeholder="Select a reason..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="item_not_received">Item Never Arrived</SelectItem>
              <SelectItem value="item_defective">Item Defective / Not Working</SelectItem>
              <SelectItem value="not_as_described">Not As Described</SelectItem>
              <SelectItem value="seller_unresponsive">Seller Unresponsive</SelectItem>
              <SelectItem value="other">Other Issue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Details</Label>
          <Textarea
            id="description"
            placeholder="Explain what went wrong. Include shipping tracking info if applicable, or photos showing the issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">
            Upload photos of the issue using our support portal after submitting this form.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            variant="destructive"
            className="flex-1"
          >
            {submitting ? "Submitting..." : "Submit Dispute"}
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
