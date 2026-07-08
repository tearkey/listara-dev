import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/post")({
  head: () => ({
    meta: [
      { title: `Post an ad — ${BRAND.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
