import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface SellerRatingFormProps {
  onSubmit: (stars: number, comment?: string) => Promise<void>;
  onCancel: () => void;
}

export function SellerRatingForm({ onSubmit, onCancel }: SellerRatingFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [aspects, setAspects] = useState({
    communication: false,
    shipping_speed: false,
    condition_accuracy: false,
    would_buy_again: false,
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;

    setSubmitting(true);
    try {
      await onSubmit(rating, comment || undefined);
    } finally {
      setSubmitting(false);
    }
  }

  const displayRating = hoverRating || rating;

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle className="text-base">Rate This Seller</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label className="text-base font-semibold">How would you rate this transaction?</Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className="h-8 w-8"
                  fill={star <= displayRating ? "currentColor" : "none"}
                  color={star <= displayRating ? "#fbbf24" : "#d1d5db"}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-sm text-green-900">
              {rating === 5 && "Excellent! You'd definitely buy from them again."}
              {rating === 4 && "Great experience overall."}
              {rating === 3 && "It was okay, but nothing special."}
              {rating === 2 && "Disappointing experience."}
              {rating === 1 && "Very poor experience."}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="comment">Your Feedback (optional)</Label>
          <Textarea
            id="comment"
            placeholder="Share your experience with this seller. What went well? What could improve?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-20"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">What was good about this experience?</Label>
          <div className="space-y-2">
            {[
              { key: "communication", label: "Great communication" },
              { key: "shipping_speed", label: "Fast shipping" },
              { key: "condition_accuracy", label: "Item was as described" },
              { key: "would_buy_again", label: "Would buy from them again" },
            ].map((item) => (
              <div key={item.key} className="flex items-center space-x-2">
                <Checkbox
                  id={item.key}
                  checked={aspects[item.key as keyof typeof aspects]}
                  onCheckedChange={(checked) =>
                    setAspects({
                      ...aspects,
                      [item.key]: checked,
                    })
                  }
                />
                <Label htmlFor={item.key} className="cursor-pointer font-normal">
                  {item.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="flex-1"
          >
            {submitting ? "Submitting..." : "Submit Rating"}
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1">
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
