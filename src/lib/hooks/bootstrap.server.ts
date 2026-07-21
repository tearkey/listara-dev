// Server-side hook registration. Emitting sites (API routes, server fn
// handlers) dynamically import this file inside their handler bodies so module
// server code never leaks into client bundles:
//
//   const { serverHooks } = await import("@/lib/hooks/bootstrap.server");
//   const { hooks, activeSlugs } = await serverHooks();
//   urls = await hooks.applyFilters("sitemap.urls", urls, ctx, activeSlugs);

import { hooks } from "./registry";
import { getActiveModuleSlugs } from "./modules.server";

let registered = false;

export async function serverHooks() {
  if (!registered) {
    registered = true;
    // Module server registrations are added as modules ship:
    //   blog      → sitemap.urls filter (Phase A5)
    //   turnstile → ad.before_create verification (Phase A7)
  }
  const activeSlugs = await getActiveModuleSlugs();
  return { hooks, activeSlugs };
}
