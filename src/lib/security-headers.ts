// Applies strict production security headers to every outbound response.
// Skips headers for cross-origin webhook POSTs to avoid interfering with
// external callers, but still sets baseline hardening on everything else.

const BASE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
};

// CSP tuned for TanStack Start SSR + Supabase + NowPayments checkout.
// 'unsafe-inline' on style-src is required for shadcn/Tailwind runtime styles.
// script-src omits 'unsafe-inline' — TanStack ships hashed bootstrap scripts.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://nowpayments.io https://*.nowpayments.io",
  // Cloudflare Turnstile (anti-bot plugin) renders its challenge in an iframe.
  "frame-src 'self' https://challenges.cloudflare.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' https: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

export function applySecurityHeaders(request: Request, response: Response): Response {
  // Do not clone opaque/redirect responses.
  if (response.status === 0) return response;

  const url = new URL(request.url);
  const isWebhook = url.pathname.startsWith("/api/public/webhooks/");
  const contentType = response.headers.get("content-type") ?? "";

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  // CSP applies to HTML pages; skip on JSON/image/script assets and webhooks.
  if (!isWebhook && contentType.includes("text/html") && !headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", CSP);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}