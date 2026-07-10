import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listAllInvoices } from "@/lib/admin.functions";

const invOpts = queryOptions({
  queryKey: ["admin", "invoices"],
  queryFn: () => listAllInvoices(),
});

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(invOpts),
  component: AdminPayments,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function AdminPayments() {
  const { data: rows } = useSuspenseQuery(invOpts);
  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Recent credit top-ups and payment invoices.</p>
      </header>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Credit</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No invoices yet.</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-[11px]">{r.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs">{r.profiles?.display_name ?? r.user_id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs">{r.kind}</td>
                <td className="px-4 py-3 text-xs"><span className="rounded bg-secondary px-2 py-0.5">{r.status}</span></td>
                <td className="px-4 py-3 text-xs font-medium">{money(r.credit_cents)}</td>
                <td className="px-4 py-3 text-xs">{r.pay_amount ? `${r.pay_amount} ${r.pay_currency?.toUpperCase()}` : "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}