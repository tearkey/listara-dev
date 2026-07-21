import { hooks } from "@/lib/hooks/registry";
import { verifyTurnstileToken } from "./verify.server";
import { manifest } from "./manifest";

// When active, every ad creation must carry a valid Turnstile token.
// Action-hook errors are logged-not-fatal by the bus, so captcha enforcement
// uses a filter (filters propagate errors) keyed on the same event name.
export function registerServerHooks() {
  hooks.addFilter<{ captchaToken?: string | null }, unknown>(
    "ad.before_create",
    async (ctx) => {
      await verifyTurnstileToken(ctx.captchaToken);
      return ctx;
    },
    { module: manifest.slug },
  );
}
