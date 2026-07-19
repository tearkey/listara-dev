import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EscrowDashboard } from "@/components/escrow/escrow-dashboard";
import { getEscrowTransaction } from "@/lib/escrow.functions";
import { useAuth } from "@/utils/auth.client";
import { BRAND } from "@/lib/brand";

function EscrowDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: escrow } = useSuspenseQuery(
    queryOptions({
      queryKey: ["escrow", id],
      queryFn: () => getEscrowTransaction({ escrowId: id }),
      refetchInterval: 30000, // Refresh every 30 seconds
    })
  );

  // Validate user is involved in this transaction
  if (!user || (escrow.buyer_id !== user.id && escrow.seller_id !== user.id)) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You don't have permission to view this transaction.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard/escrow">Back to My Escrows</Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link to="/dashboard/escrow" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to My Escrows
        </Link>

        <EscrowDashboard
          escrow={escrow}
          currentUserId={user.id}
          onStatusChange={() => {
            qc.invalidateQueries({ queryKey: ["escrow", id] });
            qc.invalidateQueries({ queryKey: ["escrows"] });
          }}
        />
      </div>
      <SiteFooter />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/escrow/$id")({
  component: EscrowDetailPage,
  head: () => ({ meta: [{ title: `Escrow Transaction — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
