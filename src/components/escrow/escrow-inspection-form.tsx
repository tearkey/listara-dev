import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type EscrowTransactionWithAd } from "@/lib/escrow.functions";

interface EscrowInspectionFormProps {
  escrow: EscrowTransactionWithAd;
  onConfirm: () => Promise<void>;
  onDispute: () => void;
  onCancel: () => void;
}

export function EscrowInspectionForm({
  escrow,
  onConfirm,
  onDispute,
  onCancel,
}: EscrowInspectionFormProps) {
  const [condition, setCondition] = useState<string>("");
  const [comments, setComments] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    if (!condition || condition === "damaged") {
      if (!window.confirm("Are you sure you want to confirm satisfaction?")) {
        return;
      }
    }

    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  const daysRemaining = escrow.auto_release_at
    ? Math.ceil(
        (new Date(escrow.auto_release_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inspect Your Item</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Inspection Period Active</AlertTitle>
          <AlertDescription>
            You have {daysRemaining} days to inspect the item and confirm satisfaction, or raise a
            dispute if there's any issue.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <Label className="text-base font-semibold">How is the item condition?</Label>
          <RadioGroup value={condition} onValueChange={setCondition}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pristine" id="pristine" />
              <Label htmlFor="pristine" className="cursor-pointer">
                Pristine — Like brand new, no signs of use
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="excellent" id="excellent" />
              <Label htmlFor="excellent" className="cursor-pointer">
                Excellent — Minimal signs of use, fully functional
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="good" id="good" />
              <Label htmlFor="good" className="cursor-pointer">
                Good — Expected wear, fully functional
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fair" id="fair" />
              <Label htmlFor="fair" className="cursor-pointer">
                Fair — Significant wear but fully functional
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="damaged" id="damaged" />
              <Label htmlFor="damaged" className="cursor-pointer">
                Damaged — Defective or not as described (recommend dispute)
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="comments">Additional Comments (optional)</Label>
          <Textarea
            id="comments"
            placeholder="Share any details about the condition, packaging, or experience..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="min-h-24"
          />
        </div>

        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900">Before You Confirm</AlertTitle>
          <AlertDescription className="text-amber-800 text-sm">
            Once you confirm satisfaction, payment will be released to the seller. You won't be able
            to dispute after this point unless there's a critical issue.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={onDispute}
            variant="destructive"
            className="w-full"
          >
            Raise Dispute
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!condition || confirming}
            className="w-full"
          >
            {confirming ? "Confirming..." : "Confirm Satisfied"}
          </Button>
        </div>

        <Button onClick={onCancel} variant="outline" className="w-full">
          Continue Inspecting
        </Button>
      </CardContent>
    </Card>
  );
}
