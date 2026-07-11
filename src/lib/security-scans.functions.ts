import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  internal_id: string;
  scanner_name: string;
  title: string;
  severity: Severity;
  description?: string | null;
  target?: string | null;
}

export interface ScanRun {
  id: string;
  created_at: string;
  created_by: string | null;
  findings: Finding[];
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  notes: string | null;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId)
    .in("role", ["admin", "superadmin"]).limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden: admin only");
}

function tally(findings: Finding[]) {
  const t = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity === "critical") t.critical++;
    else if (f.severity === "high") t.high++;
    else if (f.severity === "medium") t.medium++;
    else if (f.severity === "low") t.low++;
  }
  return t;
}

/** List recent scan runs (admin). Default limit 20. */
export const listSecurityRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScanRun[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("security_scan_runs")
      .select("id,created_at,created_by,findings,total,critical,high,medium,low,notes")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, findings: (r.findings ?? []) as unknown as Finding[] })) as ScanRun[];
  });

const RecordInput = z.object({
  findings: z.array(z.object({
    internal_id: z.string(),
    scanner_name: z.string(),
    title: z.string(),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    description: z.string().nullable().optional(),
    target: z.string().nullable().optional(),
  })),
  notes: z.string().max(2000).optional().nullable(),
});

/** Persist a snapshot of the current scan findings (admin). */
export const recordSecurityRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecordInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const t = tally(data.findings as Finding[]);
    const { data: row, error } = await context.supabase
      .from("security_scan_runs")
      .insert({
        created_by: context.userId,
        findings: data.findings as never,
        total: t.total,
        critical: t.critical,
        high: t.high,
        medium: t.medium,
        low: t.low,
        notes: data.notes ?? null,
      })
      .select("id,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; created_at: string };
  });

export interface RunDiff {
  added: Finding[];
  removed: Finding[];
  unchanged: Finding[];
}

/** Compute diff between latest two runs, plus quick highlights for SECURITY DEFINER-related findings. */
export const getSecurityDiff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    latest: ScanRun | null;
    previous: ScanRun | null;
    diff: RunDiff;
    definerHighlights: Finding[];
  }> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("security_scan_runs")
      .select("id,created_at,created_by,findings,total,critical,high,medium,low,notes")
      .order("created_at", { ascending: false })
      .limit(2);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r) => ({ ...r, findings: (r.findings ?? []) as unknown as Finding[] })) as ScanRun[];
    const latest = rows[0] ?? null;
    const previous = rows[1] ?? null;
    const latestIds = new Set((latest?.findings ?? []).map((f) => f.internal_id));
    const prevIds = new Set((previous?.findings ?? []).map((f) => f.internal_id));
    const added = (latest?.findings ?? []).filter((f) => !prevIds.has(f.internal_id));
    const removed = (previous?.findings ?? []).filter((f) => !latestIds.has(f.internal_id));
    const unchanged = (latest?.findings ?? []).filter((f) => prevIds.has(f.internal_id));
    const definerHighlights = (latest?.findings ?? []).filter((f) => {
      const hay = `${f.title} ${f.internal_id} ${f.description ?? ""}`.toLowerCase();
      return hay.includes("security_definer") || hay.includes("security definer") || hay.includes("definer_function");
    });
    return { latest, previous, diff: { added, removed, unchanged }, definerHighlights };
  });

/** Delete a run (admin). */
export const deleteSecurityRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("security_scan_runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });