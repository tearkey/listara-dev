import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";
import { bootstrapSuperadmin, getMfaStatus } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardSignIn,
});

async function routeAfterAuth(navigate: ReturnType<typeof useNavigate>) {
  try {
    const status = await getMfaStatus();
    if (!status.is_admin) {
      await supabase.auth.signOut();
      toast.error("This account has no admin access.");
      return;
    }
    if (status.requires_mfa) {
      navigate({ to: "/dashboard/mfa", replace: true });
      return;
    }
    navigate({ to: "/admin", replace: true });
  } catch (e: any) {
    toast.error(e?.message ?? "Failed to verify admin session");
  }
}

function DashboardSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Best-effort self-locking seed of the superadmin account.
  useEffect(() => {
    bootstrapSuperadmin().catch(() => {});
  }, []);

  // If already signed in, route immediately.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) routeAfterAuth(navigate);
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await routeAfterAuth(navigate);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-foreground font-display font-bold text-xl shadow-sm">
            L
          </span>
          <span className="font-display text-2xl font-bold">{BRAND.name}</span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wider">Restricted area</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorized personnel only. Access is logged.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <LockKeyhole className="h-4 w-4" />
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Two-factor authentication is required for the superadmin account.
          </p>
        </div>
      </div>
    </div>
  );
}