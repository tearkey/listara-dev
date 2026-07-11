import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Admin sign in — ${BRAND.name}` },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Restricted administrator access." },
    ],
  }),
  component: () => (
    <div className="min-h-screen bg-gradient-to-br from-secondary/40 via-background to-accent/20">
      <Outlet />
    </div>
  ),
});