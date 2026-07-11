import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MfaStatus = {
  is_superadmin: boolean;
  is_admin: boolean;
  aal: string | null;
  enrolled: boolean;
  requires_mfa: boolean;
};

export const getMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MfaStatus> => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const is_superadmin = roleSet.has("superadmin");
    const is_admin = roleSet.has("admin") || is_superadmin;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: context.userId,
    });
    const enrolled = !!factors?.factors?.some(
      (f: any) => f.factor_type === "totp" && f.status === "verified",
    );

    const aal = (context.claims as any)?.aal ?? null;

    return {
      is_superadmin,
      is_admin,
      aal,
      enrolled,
      requires_mfa: is_superadmin && aal !== "aal2",
    };
  });

// Guard used by admin routes: throws MFA_REQUIRED when a superadmin is not at aal2.
export const assertAdminMfaGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("superadmin")) {
      throw new Error("Forbidden: admin only");
    }
    if (roleSet.has("superadmin")) {
      const aal = (context.claims as any)?.aal ?? null;
      if (aal !== "aal2") throw new Error("MFA_REQUIRED");
    }
    return { ok: true };
  });

// Used post-verify to force clients to refresh their JWT so the new aal2 claim propagates.
export const _mfaPing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => ({ aal: (context.claims as any)?.aal ?? null }));