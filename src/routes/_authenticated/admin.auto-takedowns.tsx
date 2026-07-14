import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, ShieldOff, Check, Download, PlayCircle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listAutoTakedowns,
  listAdminNotifications,
  markAdminNotificationRead,
  exportAutoTakedownsCsv,
  autoTakedownDryRun,
  runAutoTakedownNow,
} from "@/lib/admin.functions";

const takedownOpts = queryOptions({
  queryKey: ["admin", "auto-takedowns"],
  queryFn: () => listAutoTakedowns(),
});
const notifOpts = queryOptions({
  queryKey: ["admin", "notifications"],
  queryFn: () => listAdminNotifications(),
});

export const Route = createFileRoute("/_authenticated/admin/auto-takedowns")({
  head: () => ({
    meta: [
      { title: "Auto take-downs — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(takedownOpts),
      context.queryClient.ensureQueryData(notifOpts),
    ]),
  component: AutoTakedownsPage,
});

function AutoTakedownsPage() {
  const { data: takedowns } = useSuspenseQuery(takedownOpts);
  const { data: notifPage } = useSuspenseQuery(notifOpts);
  const notifs = notifPage.rows;
  const qc = useQueryClient();
  const markRead = useServerFn(markAdminNotificationRead);
  const exportCsv = useServerFn(exportAutoTakedownsCsv);
  const dryRunFn = useServerFn(autoTakedownDryRun);
  const runNowFn = useServerFn(runAutoTakedownNow);
  const [threshold, setThreshold] = useState(5);
  const [dry, setDry] = useState<Awaited<ReturnType<typeof autoTakedownDryRun>> | null>(null);
  const [busy, setBusy] = useState<"dry" | "run" | null>(null);

  const unread = notifs.filter((n) => !n.read_at);

  async function preview() {
    setBusy("dry");
    try {
      const rows = await dryRunFn({ data: { threshold } });
      setDry(rows);
      toast.success(`${rows.length} ad(s) would be removed at threshold ${threshold}.`);
    } catch (e: any) {
      toast.error(e.message ?? "Dry-run failed");
    } finally { setBusy(null); }
  }

  async function runNow() {
    if (!confirm(`Run auto take-down now at threshold ${threshold}?`)) return;
    setBusy("run");
    try {
      const { removed } = await runNowFn({ data: { threshold } });
      toast.success(`Removed ${removed} ad(s).`);
      setDry(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "auto-takedowns"] }),
        qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
      ]);
    } catch (e: any) {
      toast.error(e.message ?? "Run failed");
    } finally { setBusy(null); }
  }

  async function ack(id?: string) {
    try {
      await markRead({ data: id ? { id } : { all: true } });
      await qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function downloadCsv() {
    try {
      const { csv, filename } = await exportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Automated take-downs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scheduled every 15 minutes. Ads with report counts above the threshold are
            removed automatically and admins are notified in-app.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-brand" />
          <span className="font-semibold text-sm">Manual run / dry-run</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-muted-foreground">
            Threshold
            <input
              type="number" min={1} max={100} value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 5))}
              className="mt-1 w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          <Button size="sm" variant="outline" onClick={preview} disabled={busy !== null}>
            <Wand2 className="mr-1 h-3.5 w-3.5" /> {busy === "dry" ? "Checking…" : "Dry-run"}
          </Button>
          <Button size="sm" onClick={runNow} disabled={busy !== null}>
            <PlayCircle className="mr-1 h-3.5 w-3.5" /> {busy === "run" ? "Running…" : "Run now"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Dry-run shows the exact ads that would be removed — nothing changes until you press
            <b> Run now</b>.
          </p>
        </div>
        {dry !== null && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2 text-right">Open reports</th>
                  <th className="px-3 py-2">First report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dry.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    No ads meet the threshold right now.
                  </td></tr>
                ) : dry.map((r) => (
                  <tr key={r.ad_id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="font-mono text-[10px] uppercase text-muted-foreground">#{r.short_id}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{r.open_reports}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.first_report_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand" />
            <span className="font-semibold text-sm">Notifications</span>
            {unread.length > 0 && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                {unread.length} unread
              </span>
            )}
          </div>
          {unread.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => ack()}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {notifs.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </li>
          ) : (
            notifs.slice(0, 20).map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${!n.read_at ? "bg-brand/5" : ""}`}>
                <ShieldOff className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{n.title}</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => ack(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Listing</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Reports</th>
              <th className="px-4 py-3 text-right">Threshold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {takedowns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No automated take-downs yet.
                </td>
              </tr>
            ) : (
              takedowns.map((t) => {
                const shortId = t.detail?.short_id ?? t.ads?.short_id ?? "—";
                const title = t.ads?.title ?? t.detail?.title ?? "(deleted listing)";
                return (
                  <tr key={t.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-semibold text-foreground">{title}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        #{shortId}
                        {t.ads?.status ? <> · {t.ads.status}</> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.detail?.reason === "report_threshold"
                        ? "Report threshold met"
                        : (t.detail?.reason ?? "Automated moderation")}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium">
                      {t.detail?.open_reports ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {t.detail?.threshold ?? "—"}
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