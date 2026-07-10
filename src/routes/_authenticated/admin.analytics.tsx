import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Download, TrendingUp, ShoppingCart, Percent, RefreshCw, Newspaper, Users } from "lucide-react";
import { getAnalytics, PRESETS, type Preset } from "@/lib/admin.analytics.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtInt = (v: number) => new Intl.NumberFormat("en-US").format(v);

function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const call = useServerFn(getAnalytics);

  const opts = useMemo(
    () =>
      queryOptions({
        queryKey: ["admin", "analytics", preset, from, to],
        queryFn: () =>
          call({ data: { preset, from: from || undefined, to: to || undefined, bucket: "auto" } }),
        staleTime: 30_000,
      }),
    [call, preset, from, to],
  );
  const { data, isLoading, refetch, isFetching } = useQuery(opts);

  async function download(format: "csv" | "xlsx") {
    if (!data) return;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    const params = new URLSearchParams({
      format,
      from: data.range.from.slice(0, 10),
      to: data.range.to.slice(0, 10),
      bucket: data.range.bucket,
    });
    const res = await fetch(`/api/admin/analytics/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Revenue, orders, and ad performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-md border border-border px-3 py-1.5 text-xs ${
                preset === p ? "bg-brand text-brand-foreground" : "bg-card"
              }`}
            >
              {p === "today" ? "Today" : p === "7d" ? "Last 7 days" : p === "mtd" ? "Month-to-date" : "Year-to-date"}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            />
          </div>
          <button
            onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => download("csv")} disabled={!data}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => download("xlsx")} disabled={!data}
            className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1.5 text-xs text-brand-foreground"
          >
            <Download className="h-3.5 w-3.5" /> XLSX
          </button>
        </div>
      </header>

      {isLoading || !data ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading analytics…
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label="Net revenue" value={fmtMoney(data.revenue.net_cents)} />
            <Kpi icon={ShoppingCart} label="Orders" value={fmtInt(data.revenue.orders)} />
            <Kpi icon={TrendingUp} label="Avg order value" value={fmtMoney(data.revenue.aov_cents)} />
            <Kpi icon={Newspaper} label="New ads" value={fmtInt(data.ads.new_ads)} />
            <Kpi icon={Newspaper} label="Paid ads" value={fmtInt(data.ads.paid_ads)} />
            <Kpi icon={Newspaper} label="Live ads (now)" value={fmtInt(data.ads.live_ads)} />
            <Kpi icon={Percent} label="Conversion rate" value={fmtPct(data.funnel.conversion_rate)}
                 hint={`${fmtInt(data.funnel.paying_users)} / ${fmtInt(data.funnel.new_users)} signups`} />
            <Kpi icon={Users} label="Renewal rate" value={fmtPct(data.funnel.renewal_rate)}
                 hint="repeat payers ÷ payers in range" />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-display text-sm font-semibold">Revenue over time</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} labelFormatter={(l) => l} />
                  <Area type="monotone" dataKey="revenue_usd" name="Revenue (USD)"
                        stroke="hsl(var(--brand))" fill="url(#rev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-display text-sm font-semibold">Ads posted (new vs paid)</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="new_ads" name="New ads" fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="paid_ads" name="Paid ads" fill="hsl(var(--brand))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}