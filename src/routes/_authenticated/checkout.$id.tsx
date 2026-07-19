import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EscrowCheckout } from "@/components/escrow/escrow-checkout";
import { getMyAd } from "@/lib/ads.functions";
import { BRAND } from "@/lib/brand";

function CheckoutPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Fetch ad details
  const { data: ad } = useSuspenseQuery(
    queryOptions({
      queryKey: ["checkout-ad", id],
      queryFn: () => getMyAd({ data: { id } }),
    })
  );

  if (!ad) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Item not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">The item you're trying to purchase could not be found.</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold">Secure Checkout</h1>
          <p className="mt-2 text-muted-foreground">
            Your payment will be securely held until you confirm the item meets your expectations.
          </p>
        </div>

        <EscrowCheckout
          ad={ad}
          onSuccess={(escrowId) => {
            navigate({ to: `/dashboard/escrow/${escrowId}` });
          }}
        />
      </div>
      <SiteFooter />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/checkout.$id")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: `Checkout — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
