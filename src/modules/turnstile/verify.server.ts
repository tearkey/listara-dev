// Server-side Turnstile token verification.
// Fails OPEN when TURNSTILE_SECRET_KEY is unset so dev/preview environments
// and sites that haven't configured keys keep working; the plugin toggle in
// /admin/modules is the on/off switch, the env vars are the credentials.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token: string | undefined | null): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new Error("Captcha required — please complete the challenge and try again.");
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const body = (await res.json()) as { success?: boolean };
  if (!body.success) {
    throw new Error("Captcha verification failed — please try again.");
  }
}
