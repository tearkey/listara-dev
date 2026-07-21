// Client-safe module registration. Every shipped module's register() is
// imported statically so the bundler sees them all; activation is checked at
// use time via the modules table (see use-active-modules / modules.server).
//
// Adding a plugin = create src/modules/<slug>/, seed its row in a migration,
// and import its register() here.

import { registerModule } from "./registry";

let booted = false;

export function bootstrapModules() {
  if (booted) return;
  booted = true;
  // Module registrations are added as modules ship:
  //   blog      → registered in src/modules/blog/register.ts (Phase A5)
  //   turnstile → registered in src/modules/turnstile/register.ts (Phase A7)
  void registerModule; // keeps the import referenced until first module lands
}
