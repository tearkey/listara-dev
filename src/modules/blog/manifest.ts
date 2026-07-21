import type { ModuleManifest } from "@/lib/hooks/registry";

export const manifest: ModuleManifest = {
  slug: "blog",
  kind: "plugin",
  name: "Blog",
  version: "0.1.0",
  navLinks: [{ to: "/blog", label: "Blog" }],
  adminNav: [{ to: "/admin/blog", label: "Blog" }],
};
