// Server-side hook registration. Emitting sites (API routes, server fn
// handlers) dynamically import this file inside their handler bodies so module
// server code never leaks into client bundles:
//
//   const { serverHooks } = await import("@/lib/hooks/bootstrap.server");
//   const { hooks, activeSlugs } = await serverHooks();
//   urls = await hooks.applyFilters("sitemap.urls", urls, ctx, activeSlugs);

import { hooks } from "./registry";
import { getActiveModuleSlugs } from "./modules.server";
import { registerServerHooks as registerBlogServerHooks } from "@/modules/blog/server-hooks.server";
import { registerServerHooks as registerTurnstileServerHooks } from "@/modules/turnstile/server-hooks.server";

let registered = false;

export async function serverHooks() {
  if (!registered) {
    registered = true;
    registerBlogServerHooks();
    registerTurnstileServerHooks();
  }
  const activeSlugs = await getActiveModuleSlugs();
  return { hooks, activeSlugs };
}
