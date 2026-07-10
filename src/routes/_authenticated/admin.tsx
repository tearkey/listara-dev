import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, Users, Newspaper, CreditCard, ToggleLeft, ScrollText, LayoutDashboard, Gavel } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getAdminStats } from "@/lib/admin.functions";
import { BRAND } from "@/lib/brand";

// Gate the whole /admin/* subtree on admin role (via stats fetch — throws Forbidden otherwise).
const gateOpts = queryOptions({
  queryKey: ["admin", "gate"],
  queryFn: () => getAdminStats(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: `Admin — ${BRAND.name}` },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(gateOpts),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 font-display text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/moderation-dashboard", label: "Moderation", icon: Gavel },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/ads", label: "Ads", icon: Newspaper },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/flags", label: "Feature flags", icon: ToggleLeft },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
] as const;

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useSuspenseQuery(gateOpts); // ensures forbidden throws render the errorComponent
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" />
          <span className="font-display text-lg font-bold">Admin panel</span>
        </div>
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <aside className="rounded-2xl border border-border bg-card p-2 md:sticky md:top-20 h-max">
            <nav className="flex md:flex-col gap-1 overflow-x-auto">
              {NAV.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                      active
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}