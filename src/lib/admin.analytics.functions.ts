import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Preset date ranges used by the dashboard and export UI. */
export const PRESETS = ["today", "7d", "mtd", "ytd", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

function resolveRange(preset: Preset, from?: string, to?: string) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  let start = new Date(now);
  switch (preset) {
    case "today":
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "mtd":
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case "ytd":
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      break;
    case "custom":
      if (!from || !to) throw new Error("custom range requires from + to (YYYY-MM-DD)");
      start = new Date(from + "T00:00:00Z");
      end.setTime(new Date(to + "T23:59:59Z").getTime());
      break;
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

function pickBucket(fromISO: string, toISO: string): "day" | "week" | "month" {
  const days = (Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000;
  if (days <= 45) return "day";
  if (days <= 365) return "week";
  return "month";
}

const RangeInput = z.object({
  preset: z.enum(PRESETS).default("7d"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bucket: z.enum(["day", "week", "month", "auto"]).default("auto"),
});

export type AnalyticsSummary = {
  range: { from: string; to: string; bucket: "day" | "week" | "month" };
  revenue: { net_cents: number; orders: number; aov_cents: number };
  ads: { new_ads: number; paid_ads: number; live_ads: number };
  funnel: {
    new_users: number;
    paying_users: number;
    conversion_rate: number; // 0..1
    renewal_rate: number;    // 0..1
  };
  series: Array<{
    date: string;          // ISO
    label: string;         // formatted for charts
    revenue_cents: number;
    revenue_usd: number;
    orders: number;
    new_ads: number;
    paid_ads: number;
  }>;
};

function fmtLabel(iso: string, bucket: "day" | "week" | "month") {
  const d = new Date(iso);
  if (bucket === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Full dashboard payload (summary KPIs + chart series) in one round-trip. */
export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RangeInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<AnalyticsSummary> => {
    const { from, to } = resolveRange(data.preset, data.from, data.to);
    const bucket = data.bucket === "auto" ? pickBucket(from, to) : data.bucket;

    const [summaryRes, seriesRes] = await Promise.all([
      context.supabase.rpc("admin_analytics_summary", { _from: from, _to: to }),
      context.supabase.rpc("admin_analytics_series", { _from: from, _to: to, _bucket: bucket }),
    ]);
    if (summaryRes.error) throw new Error(summaryRes.error.message);
    if (seriesRes.error) throw new Error(seriesRes.error.message);

    const summary = summaryRes.data as AnalyticsSummary;
    const series = ((seriesRes.data ?? []) as Array<{
      bucket_start: string;
      revenue_cents: number;
      orders: number;
      new_ads: number;
      paid_ads: number;
    }>).map((r) => ({
      date: r.bucket_start,
      label: fmtLabel(r.bucket_start, bucket),
      revenue_cents: Number(r.revenue_cents),
      revenue_usd: Number(r.revenue_cents) / 100,
      orders: r.orders,
      new_ads: r.new_ads,
      paid_ads: r.paid_ads,
    }));

    return {
      ...summary,
      range: { from, to, bucket },
      series,
    };
  });