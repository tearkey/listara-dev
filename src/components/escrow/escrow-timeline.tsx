import { Package, Truck, CheckCircle2, Clock } from "lucide-react";
import { type EscrowTransactionWithAd } from "@/lib/escrow.functions";

interface EscrowTimelineProps {
  escrow: EscrowTransactionWithAd;
}

export function EscrowTimeline({ escrow }: EscrowTimelineProps) {
  const steps = [
    {
      id: "payment",
      label: "Payment Received",
      timestamp: escrow.payment_received_at,
      icon: CheckCircle2,
      completed: !!escrow.payment_received_at,
    },
    {
      id: "shipped",
      label: "Item Shipped",
      timestamp: escrow.shipped_at,
      icon: Package,
      completed: !!escrow.shipped_at,
    },
    {
      id: "received",
      label: "Item Received",
      timestamp: escrow.received_at,
      icon: Truck,
      completed: !!escrow.received_at,
    },
    {
      id: "released",
      label: "Payment Released",
      timestamp: escrow.released_at,
      icon: CheckCircle2,
      completed: !!escrow.released_at,
    },
  ];

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isLast = index === steps.length - 1;
        const isActive = step.completed;

        return (
          <div key={step.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`rounded-full p-2 ${
                  isActive ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              {!isLast && (
                <div
                  className={`w-1 h-12 ${isActive ? "bg-green-200" : "bg-gray-200"}`}
                />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="font-semibold text-sm">{step.label}</div>
              {step.timestamp ? (
                <div className="text-xs text-muted-foreground">
                  {new Date(step.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Pending</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
