import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Webhook, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNowpaymentsHealth, listCronStatus } from "@/lib/admin.functions";

const healthOpts = queryOptions({
  queryKey: ["admin", "webhooks", "nowpayments"],
  queryFn: () => getNowpaymentsHealth(),
  staleTime: 30_000,
});
const cronOpts = queryOptions({
  queryKey: ["admin", "cron", "status"],
  queryFn: () => listCronStatus(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks & cron health — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(healthOpts),
      context.queryClient.ensureQueryData(cronOpts),
    ]),
  component: WebhookHealthPage,
});

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {label}
    </span>
  );
}

function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function WebhookHealthPage() {
  const { data: health } = useSuspenseQuery(healthOpts);
  const { data: crons } = useSuspenseQuery(cronOpts);
  const qc = useQueryClient();

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "webhooks", "nowpayments"] }),
      qc.invalidateQueries({ queryKey: ["admin", "cron", "status"] }),
    ]);
  }

  const lastAt = health.last_webhook?.updated_at ?? null;
  const stale = lastAt ? Date.now() - new Date(lastAt).getTime() > 24 * 3600_000 : true;

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Webhooks & cron health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live status of the NowPayments IPN endpoint and every scheduled job.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Webhook className="h-4 w-4 text-brand" />
          <span className="font-semibold text-sm">NowPayments IPN</span>
          <Badge ok={health.signing_secret_configured} label="IPN secret set" />
          <Badge ok={health.api_key_configured} label="API key set" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Last webhook received" value={ago(lastAt)} accent={stale ? "warn" : "ok"} />
          <Stat label="Last invoice status" value={health.last_webhook?.status ?? "—"} />
          <Stat
            label="Credit float (system-wide)"
            value={`$${(health.credit_float_cents / 100).toFixed(2)}`}
          />
        </div>
        {health.last_webhook && (
          <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs">
            <div className="grid gap-2 md:grid-cols-2">
              <KV label="Order ID" value={health.last_webhook.nowpayments_order_id ?? "—"} />
              <KV label="Payment ID" value={health.last_webhook.nowpayments_payment_id ?? "—"} />
              <KV
                label="Amount"
                value={
                  health.last_webhook.pay_amount != null
                    ? `${health.last_webhook.pay_amount} ${health.last_webhook.pay_currency ?? ""}`
                    : "—"
                }
              />
              <KV label="Updated" value={new Date(health.last_webhook.updated_at).toLocaleString()} />
            </div>
          </div>
        )}
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Recent verification results (last 20 webhook-touched invoices)
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(health.recent_counts).length === 0 ? (
              <span className="text-muted-foreground">No webhooks received yet.</span>
            ) : (
              Object.entries(health.recent_counts).map(([k, v]) => (
                <span key={k} className="rounded-full bg-secondary px-2 py-0.5">
                  {k}: <b>{v}</b>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Clock className="h-4 w-4 text-brand" />
          <span className="font-semibold text-sm">Scheduled jobs</span>
          <span className="text-xs text-muted-foreground">
            Admins are alerted in-app when a job fails or misses its interval.
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">Schedule</th>
              <th className="px-4 py-2">Last run</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {crons.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No cron jobs registered.
                </td>
              </tr>
            ) : (
              crons.map((j) => {
                const bad = j.last_status !== "succeeded" && j.last_status !== null;
                const missed = !j.last_start || Date.now() - new Date(j.last_start).getTime() > 3600_000;
                return (
                  <tr key={j.jobid} className="align-top">
                    <td className="px-4 py-2 font-mono text-xs">{j.jobname}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{j.schedule}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{ago(j.last_start)}</td>
                    <td className="px-4 py-2 text-xs">
                      {bad ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                          <XCircle className="h-3 w-3" /> {j.last_status}
                        </span>
                      ) : missed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> stale
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> ok
                        </span>
                      )}
                    </td>
                    <td className="max-w-md truncate px-4 py-2 text-xs text-muted-foreground" title={j.last_return_message ?? ""}>
                      {j.last_return_message ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-lg font-bold ${
          accent === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{value}</div>
    </div>
  );
}