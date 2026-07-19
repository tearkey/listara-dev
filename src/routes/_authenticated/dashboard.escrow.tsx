import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Package, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listUserEscrows, type EscrowStatus } from "@/lib/escrow.functions";
import { BRAND } from "@/lib/brand";

function EscrowDashboardPage() {
  const listEscrowsFn = useServerFn(listUserEscrows);
  const [selectedRole, setSelectedRole] = useState<"buyer" | "seller">("buyer");

  // Fetch buyer escrows
  const { data: buyerEscrows } = useSuspenseQuery(
    queryOptions({
      queryKey: ["escrows", "buyer"],
      queryFn: () => listEscrowsFn({ role: "buyer", limit: 50 }),
    })
  );

  // Fetch seller escrows
  const { data: sellerEscrows } = useSuspenseQuery(
    queryOptions({
      queryKey: ["escrows", "seller"],
      queryFn: () => listEscrowsFn({ role: "seller", limit: 50 }),
    })
  );

  const escrows = selectedRole === "buyer" ? buyerEscrows.escrows : sellerEscrows.escrows;
  const total = selectedRole === "buyer" ? buyerEscrows.total : sellerEscrows.total;

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-900",
    shipped: "bg-blue-100 text-blue-900",
    in_transit: "bg-purple-100 text-purple-900",
    released: "bg-green-100 text-green-900",
    refunded: "bg-red-100 text-red-900",
    disputed: "bg-orange-100 text-orange-900",
  };

  const statusIcons = {
    pending: "⏳",
    shipped: "📦",
    in_transit: "🚚",
    released: "✅",
    refunded: "💰",
    disputed: "⚠️",
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold">My Escrows</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your purchases and sales with escrow protection.
          </p>
        </div>

        <Tabs value={selectedRole} onValueChange={(v) => setSelectedRole(v as "buyer" | "seller")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buyer">Purchases ({buyerEscrows.total})</TabsTrigger>
            <TabsTrigger value="seller">Sales ({sellerEscrows.total})</TabsTrigger>
          </TabsList>

          {/* Buyer Tab */}
          <TabsContent value="buyer" className="space-y-4 mt-6">
            {escrows.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">No purchases yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Find items to buy and start making purchases with escrow protection.
                  </p>
                  <Button asChild>
                    <Link to="/search">Browse Items</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              escrows.map((escrow) => (
                <Link key={escrow.id} to={`/dashboard/escrow/${escrow.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold line-clamp-1">{escrow.ad?.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            ${(escrow.amount_cents / 100).toFixed(2)} • Created{" "}
                            {new Date(escrow.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${statusColors[escrow.status as keyof typeof statusColors]}`}>
                            {statusIcons[escrow.status as keyof typeof statusIcons]}{" "}
                            {escrow.status.replace(/_/g, " ")}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </TabsContent>

          {/* Seller Tab */}
          <TabsContent value="seller" className="space-y-4 mt-6">
            {escrows.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">No sales yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Post items for sale and start earning with escrow protection.
                  </p>
                  <Button asChild>
                    <Link to="/post">Post an Item</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              escrows.map((escrow) => (
                <Link key={escrow.id} to={`/dashboard/escrow/${escrow.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold line-clamp-1">{escrow.ad?.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            ${(escrow.amount_cents / 100).toFixed(2)} • Created{" "}
                            {new Date(escrow.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${statusColors[escrow.status as keyof typeof statusColors]}`}>
                            {statusIcons[escrow.status as keyof typeof statusIcons]}{" "}
                            {escrow.status.replace(/_/g, " ")}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
      <SiteFooter />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/escrow")({
  component: EscrowDashboardPage,
  head: () => ({ meta: [{ title: `My Escrows — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
