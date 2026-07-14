import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Check, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAdminNotifications, markAdminNotificationRead } from "@/lib/admin.functions";

const notifOpts = queryOptions({
  queryKey: ["admin", "notifications"],
  queryFn: () => listAdminNotifications(),
});

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(notifOpts),
  component: InboxPage,
});

function InboxPage() {
  const { data: notifs } = useSuspenseQuery(notifOpts);
  const qc = useQueryClient();
  const markRead = useServerFn(markAdminNotificationRead);
  const unread = notifs.filter((n) => !n.read_at);

  async function ack(id?: string) {
    try {
      await markRead({ data: id ? { id } : { all: true } });
      await qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      await qc.invalidateQueries({ queryKey: ["admin", "notifications", "unread-count"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Inbox className="h-5 w-5 text-brand" /> Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            System notifications for admins — moderation auto-takedowns and other automated events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
            {unread.length} unread
          </span>
          {unread.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => ack()}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </header>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {notifs.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            No notifications yet.
          </li>
        ) : (
          notifs.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${!n.read_at ? "bg-brand/5" : ""}`}
            >
              <Bell className={`mt-0.5 h-4 w-4 ${!n.read_at ? "text-brand" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{n.title}</span>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
                  {n.kind}
                  {n.target_table ? <> · {n.target_table}</> : null}
                </div>
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
    </section>
  );
}