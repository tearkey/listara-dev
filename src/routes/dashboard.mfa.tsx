import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Smartphone, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/mfa")({
  component: MfaPage,
});

type Mode = "loading" | "enroll" | "challenge";

function MfaPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      // If already at aal2, we shouldn't be here.
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal2") {
        navigate({ to: "/admin", replace: true });
        return;
      }

      const { data: factorsData, error: fErr } = await supabase.auth.mfa.listFactors();
      if (fErr) {
        toast.error(fErr.message);
        return;
      }
      const verified = factorsData?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setMode("challenge");
        return;
      }

      // Clean any stale unverified factors, then enroll fresh.
      const stale = factorsData?.totp?.filter((f) => f.status !== "verified") ?? [];
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });

      const { data: enroll, error: eErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${BRAND.name} Superadmin`,
      });
      if (eErr) {
        toast.error(eErr.message);
        return;
      }
      setFactorId(enroll.id);
      setQr(enroll.totp.qr_code);
      setSecret(enroll.totp.secret);
      setMode("enroll");
    })();
  }, [navigate]);

  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) {
      setBusy(false);
      toast.error(cErr.message);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) {
      toast.error(vErr.message);
      return;
    }
    toast.success("Two-factor authentication enabled");
    navigate({ to: "/admin", replace: true });
  }

  async function verifyChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) {
      setBusy(false);
      toast.error(cErr.message);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) {
      toast.error(vErr.message);
      return;
    }
    navigate({ to: "/admin", replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Two-factor required
            </span>
          </div>

          {mode === "loading" ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : mode === "enroll" ? (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold">Set up your authenticator</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Scan this QR code with Google Authenticator, Proton Authenticator, 1Password, or any
                other TOTP app, then enter the 6-digit code to finish.
              </p>
              {qr ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {/* Supabase returns a data: URL SVG */}
                  <img
                    src={qr}
                    alt="TOTP QR code"
                    className="h-48 w-48 rounded-lg border border-border bg-white p-2"
                  />
                  {secret ? (
                    <p className="text-center text-xs text-muted-foreground break-all">
                      Can't scan? Enter this key manually:
                      <br />
                      <code className="font-mono text-foreground">{secret}</code>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <form onSubmit={verifyEnrollment} className="mt-6 space-y-3">
                <div>
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 text-center text-xl tracking-[0.5em] font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Smartphone className="h-4 w-4" /> Verify &amp; enable
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold">Enter your 2FA code</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Open your authenticator app and enter the current 6-digit code.
              </p>
              <form onSubmit={verifyChallenge} className="mt-6 space-y-3">
                <div>
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 text-center text-xl tracking-[0.5em] font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  Verify
                </Button>
              </form>
            </>
          )}

          <button
            onClick={signOut}
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}