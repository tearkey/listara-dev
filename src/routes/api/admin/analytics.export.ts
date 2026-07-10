import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * GET /api/admin/analytics/export?format=csv|xlsx&from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day|week|month
 *
 * Auth: caller must send `Authorization: Bearer <supabase access token>`.
 * The server calls the SECURITY DEFINER RPCs which enforce `has_role('admin')`.
 */
export const Route = createFileRoute("/api/admin/analytics/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const bucket = (url.searchParams.get("bucket") ?? "day").toLowerCase();
        if (!from || !to) return new Response("from & to required (YYYY-MM-DD)", { status: 400 });
        if (!["day", "week", "month"].includes(bucket))
          return new Response("bucket must be day|week|month", { status: 400 });
        if (!["csv", "xlsx"].includes(format))
          return new Response("format must be csv|xlsx", { status: 400 });

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.toLowerCase().startsWith("bearer "))
          return new Response("Unauthorized", { status: 401 });

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: authHeader } },
          },
        );

        const fromISO = new Date(from + "T00:00:00Z").toISOString();
        const toISO = new Date(to + "T23:59:59Z").toISOString();

        const [summary, series] = await Promise.all([
          supabase.rpc("admin_analytics_summary", { _from: fromISO, _to: toISO }),
          supabase.rpc("admin_analytics_series", { _from: fromISO, _to: toISO, _bucket: bucket }),
        ]);
        if (summary.error) return new Response(summary.error.message, { status: 403 });
        if (series.error) return new Response(series.error.message, { status: 403 });

        const rows = (series.data ?? []) as Array<{
          bucket_start: string; revenue_cents: number; orders: number;
          new_ads: number; paid_ads: number;
        }>;

        const s = summary.data as any;
        const filenameBase = `analytics_${from}_to_${to}`;

        if (format === "csv") {
          const header = "date,revenue_usd,orders,new_ads,paid_ads\n";
          const body = rows
            .map((r) => [
              r.bucket_start.slice(0, 10),
              (Number(r.revenue_cents) / 100).toFixed(2),
              r.orders,
              r.new_ads,
              r.paid_ads,
            ].join(","))
            .join("\n");
          const footer =
            `\n\nSUMMARY\n` +
            `net_revenue_usd,${(Number(s.revenue.net_cents) / 100).toFixed(2)}\n` +
            `orders,${s.revenue.orders}\n` +
            `aov_usd,${(Number(s.revenue.aov_cents) / 100).toFixed(2)}\n` +
            `new_users,${s.funnel.new_users}\n` +
            `paying_users,${s.funnel.paying_users}\n` +
            `conversion_rate,${s.funnel.conversion_rate}\n` +
            `renewal_rate,${s.funnel.renewal_rate}\n` +
            `new_ads,${s.ads.new_ads}\n` +
            `paid_ads,${s.ads.paid_ads}\n` +
            `live_ads,${s.ads.live_ads}\n`;
          return new Response("\ufeff" + header + body + footer, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": `attachment; filename="${filenameBase}.csv"`,
            },
          });
        }

        // XLSX
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        const summarySheet = XLSX.utils.aoa_to_sheet([
          ["Metric", "Value"],
          ["Range from", from],
          ["Range to", to],
          ["Bucket", bucket],
          ["Net revenue (USD)", Number(s.revenue.net_cents) / 100],
          ["Orders", s.revenue.orders],
          ["Average order value (USD)", Number(s.revenue.aov_cents) / 100],
          ["New users", s.funnel.new_users],
          ["Paying users", s.funnel.paying_users],
          ["Conversion rate", s.funnel.conversion_rate],
          ["Renewal rate", s.funnel.renewal_rate],
          ["New ads", s.ads.new_ads],
          ["Paid ads", s.ads.paid_ads],
          ["Live ads", s.ads.live_ads],
        ]);
        XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

        const seriesSheet = XLSX.utils.json_to_sheet(
          rows.map((r) => ({
            date: r.bucket_start.slice(0, 10),
            revenue_usd: Number(r.revenue_cents) / 100,
            orders: r.orders,
            new_ads: r.new_ads,
            paid_ads: r.paid_ads,
          })),
        );
        XLSX.utils.book_append_sheet(wb, seriesSheet, "Series");

        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        return new Response(buf, {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": `attachment; filename="${filenameBase}.xlsx"`,
          },
        });
      },
    },
  },
});