import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { Bell, Check, ChevronLeft, ChevronRight, Download, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listAdminNotifications,
  listAdminNotificationKinds,
  markAdminNotificationRead,
  exportAdminNotificationsCsv,
} from "@/lib/admin.functions";

const searchSchema = z.object({
  page: fallback(z.number().int(), 1).default(1),
  size: fallback(z.number().int(), 25).default(25),
  status: fallback(z.enum(["all", "unread", "read"]), "all").default("all"),
  kind: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  order: fallback(z.enum(["newest", "oldest"]), "newest").default("newest"),
});

type SearchState = z.infer<typeof searchSchema>;

function buildArgs(s: SearchState) {
  return {
    page: Math.max(1, s.page),
    pageSize: Math.min(200, Math.max(1, s.size)),
    status: s.status,
    kind: s.kind || undefined,
    q: s.q ? s.q.slice(0, 200) : undefined,
    order: s.order,
  };
}

const notifsOpts = (s: SearchState) =>
  queryOptions({
    queryKey: ["admin", "notifications", buildArgs(s)],
    queryFn: () => listAdminNotifications({ data: buildArgs(s) }),
  });
const kindsOpts = queryOptions({
  queryKey: ["admin", "notifications", "kinds"],
  queryFn: () => listAdminNotificationKinds(),
});

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  head: () => ({
    meta: [
      { title: "Inbox — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(notifsOpts(deps)),
      context.queryClient.ensureQueryData(kindsOpts),
    ]),
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: page } = useSuspenseQuery(notifsOpts(search));
  const { data: kinds } = useSuspenseQuery(kindsOpts);
  const qc = useQueryClient();
  const markRead = useServerFn(markAdminNotificationRead);
  const exportCsv = useServerFn(exportAdminNotificationsCsv);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { rows, total, pageSize } = page;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(search.page, pageCount);
  const selectableUnread = useMemo(() => rows.filter((n) => !n.read_at).map((n) => n.id), [rows]);
  const allUnreadSelected =
    selectableUnread.length > 0 && selectableUnread.every((id) => selected.has(id));

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "unread-count"] }),
    ]);
  }

  async function ackOne(id: string) {
    try {
      await markRead({ data: { id } });
      setSelected((prev) => {
        const next = new Set(prev); next.delete(id); return next;
      });
      await invalidate();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }
  async function ackSelected() {
    const ids = Array.from(selected).filter((id) => selectableUnread.includes(id));
    if (ids.length === 0) return;
    try {
      await markRead({ data: { ids } });
      setSelected(new Set());
      await invalidate();
      toast.success(`Marked ${ids.length} as read`);
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }
  async function ackAll() {
    try {
      await markRead({ data: { all: true } });
      setSelected(new Set());
      await invalidate();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allUnreadSelected) selectableUnread.forEach((id) => next.delete(id));
      else selectableUnread.forEach((id) => next.add(id));
      return next;
    });
  }

  function setSearch(patch: Partial<SearchState>, resetPage = true) {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: 1 } : {}) }),
    });
  }

  async function downloadCsv() {
    try {
      const args = buildArgs(search);
      const { csv, filename } = await exportCsv({
        data: { status: args.status, kind: args.kind, q: args.q, order: args.order },
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message ?? "Export failed"); }
  }

  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  const chips: Array<{ key: string; label: string; active: boolean; onClick: () => void }> = [
    { key: "all", label: "All", active: search.status === "all" && !search.kind,
      onClick: () => setSearch({ status: "all", kind: "" }) },
    { key: "unread", label: "Unread", active: search.status === "unread",
      onClick: () => setSearch({ status: "unread" }) },
    { key: "read", label: "Read", active: search.status === "read",
      onClick: () => setSearch({ status: "read" }) },
    ...kinds.map((k) => ({
      key: `kind:${k}`,
      label: k.replace(/_/g, " "),
      active: search.kind === k,
      onClick: () => setSearch({ kind: search.kind === k ? "" : k }),
    })),
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Inbox className="h-5 w-5 text-brand" /> Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            System notifications for admins — moderation auto-takedowns and other automated events.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={ackAll}>
            <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              c.active
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search.q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="Search title or body…"
            className="h-8 w-56 text-xs"
          />
          <select
            value={search.order}
            onChange={(e) => setSearch({ order: e.target.value as "newest" | "oldest" }, false)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select
            value={search.size}
            onChange={(e) => setSearch({ size: Number(e.target.value) })}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allUnreadSelected}
            disabled={selectableUnread.length === 0}
            onCheckedChange={toggleAllOnPage}
            aria-label="Select all unread on page"
          />
          <span className="text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${from}–${to} of ${total}`}
          </span>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" className="h-7" onClick={ackSelected}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark selected read
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            disabled={currentPage <= 1}
            onClick={() => setSearch({ page: currentPage - 1 }, false)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[60px] text-center text-muted-foreground">
            {currentPage} / {pageCount}
          </span>
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            disabled={currentPage >= pageCount}
            onClick={() => setSearch({ page: currentPage + 1 }, false)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            No notifications match these filters.
          </li>
        ) : (
          rows.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${!n.read_at ? "bg-brand/5" : ""}`}
            >
              <Checkbox
                checked={selected.has(n.id)}
                disabled={!!n.read_at}
                onCheckedChange={() => toggle(n.id)}
                aria-label={`Select ${n.title}`}
                className="mt-1"
              />
              <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${!n.read_at ? "text-brand" : "text-muted-foreground"}`} />
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
                <Button size="sm" variant="ghost" onClick={() => ackOne(n.id)}>
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