import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listAuditLog } from "@/lib/admin.functions";

const opts = queryOptions({
  queryKey: ["admin", "audit"],
  queryFn: () => listAuditLog(),
});

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: AdminAudit,
});

function AdminAudit() {
  const { data: rows } = useSuspenseQuery(opts);
  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Recent admin and moderator actions.</p>
      </header>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No events yet.</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">{r.profiles?.display_name ?? r.actor_id?.slice(0, 8) ?? "system"}</td>
                <td className="px-4 py-3 text-xs font-mono">{r.action}</td>
                <td className="px-4 py-3 text-xs">{r.target_type}:{r.target_id?.slice(0, 8)}</td>
                <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground max-w-md truncate">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}