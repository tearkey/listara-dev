// Client-safe module registration. Every shipped module's register() is
// imported statically so the bundler sees them all; activation is checked at
// use time via the modules table (see use-active-modules / modules.server).
//
// Adding a plugin = create src/modules/<slug>/, seed its row in a migration,
// and import its register() here.

import { register as registerBlog } from "@/modules/blog/register";

let booted = false;

export function bootstrapModules() {
  if (booted) return;
  booted = true;
  registerBlog();
}
