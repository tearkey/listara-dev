import { registerModule } from "@/lib/hooks/registry";
import { manifest } from "./manifest";

export function register() {
  registerModule(manifest);
}
