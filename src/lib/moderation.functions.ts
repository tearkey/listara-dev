import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listPendingAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("ads")
      .select(
        "id, short_id, title, body, status, price_cents, currency, created_at, user_id, cities(name, states(code)), categories(name), profiles(display_name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const setStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["live", "rejected"]),
  rejection_reason: z.string().trim().max(500).optional(),
});

export const setAdStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("ads")
      .update(
        data.status === "live"
          ? {
              status: "live" as const,
              posted_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              rejection_reason: null,
            }
          : {
              status: "rejected" as const,
              rejection_reason: data.rejection_reason ?? "Rejected by moderator",
            },
      )
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, id: data.id, status: data.status };
  });