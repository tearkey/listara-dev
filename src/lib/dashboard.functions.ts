import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SEED_SUPERADMIN_EMAIL = "techtrick.com.bd@gmail.com";

/**
 * Idempotent, self-locking bootstrap for the single superadmin account.
 * Once a user has the `superadmin` role, this fn becomes a no-op (returns
 * `{ already: true }`) so it is safe to expose without auth.
 */
export const bootstrapSuperadmin = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Self-lock: if any superadmin already exists, refuse.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin" as any)
      .limit(1);
    if (exErr) throw new Error(exErr.message);
    if (existing && existing.length > 0) {
      return { ok: true, already: true as const };
    }

    const email = SEED_SUPERADMIN_EMAIL;
    const password = "Tearkey@12$$";

    // Find or create the auth user.
    let userId: string | undefined;
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      userId = found.id;
      // Reset password + confirm email so sign-in works immediately.
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) throw new Error(updErr.message);
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (cErr) throw new Error(cErr.message);
      userId = created.user!.id;
    }

    // Grant admin + superadmin roles.
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        [
          { user_id: userId, role: "admin" as const },
          { user_id: userId, role: "superadmin" as any },
        ],
        { onConflict: "user_id,role" },
      );
    if (rErr) throw new Error(rErr.message);

    return { ok: true, already: false as const, user_id: userId };
  },
);

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