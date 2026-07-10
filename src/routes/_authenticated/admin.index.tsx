import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Users, Newspaper, ShieldAlert, CircleDollarSign, Wallet, Activity } from "lucide-react";
import { getAdminStats } from "@/lib/admin.functions";

const statsOpts = queryOptions({
  queryKey: ["admin", "gate"],
  queryFn: () => getAdminStats(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin dashboard" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statsOpts),
  component: AdminDashboard,
});

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function AdminDashboard() {
  const { data: s } = useSuspenseQuery(statsOpts);
  const cards = [
    { label: "Users", value: s.users.toLocaleString(), icon: Users },
    { label: "Total ads", value: s.ads.toLocaleString(), icon: Newspaper },
    { label: "Live ads", value: s.live.toLocaleString(), icon: Activity },
    { label: "Pending review", value: s.pending.toLocaleString(), icon: ShieldAlert },
    { label: "Lifetime top-ups", value: money(s.topups_cents), icon: CircleDollarSign },
    { label: "Outstanding credits", value: money(s.credit_float_cents), icon: Wallet },
  ];
  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Snapshot of platform activity.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-brand" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}