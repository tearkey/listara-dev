import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, ShieldOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listAutoTakedowns,
  listAdminNotifications,
  markAdminNotificationRead,
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
  const { data: notifs } = useSuspenseQuery(notifOpts);
  const qc = useQueryClient();
  const markRead = useServerFn(markAdminNotificationRead);

  const unread = notifs.filter((n) => !n.read_at);

  async function ack(id?: string) {
    try {
      await markRead({ data: id ? { id } : { all: true } });
      await qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <section className="space-y-8">
      <header>
        <h1 className="font-display text-xl font-bold">Automated take-downs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scheduled every 15 minutes. Ads with report counts above the threshold are
          removed automatically and admins are notified in-app.
        </p>
      </header>

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