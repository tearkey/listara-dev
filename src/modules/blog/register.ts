import { registerModule } from "@/lib/hooks/registry";
import { manifest } from "./manifest";

// Client-safe registration: manifest only (nav links, admin nav). Server-side
// hook bindings live in server-hooks.server.ts.
export function register() {
  registerModule(manifest);
}
