import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPendingAds, setAdStatus } from "@/lib/moderation.functions";

const pendingOpts = queryOptions({
  queryKey: ["admin", "pending-ads"],
  queryFn: () => listPendingAds(),
});

export const Route = createFileRoute("/_authenticated/admin/moderation-dashboard")({
  head: () => ({ meta: [{ title: "Moderation — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(pendingOpts),
  component: ModerationDashboard,
});

function fmtPrice(cents: number | null, currency: string) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function ModerationDashboard() {
  const { data: rows } = useSuspenseQuery(pendingOpts);
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setAdStatus);
  const [busy, setBusy] = useState<Record<string, "live" | "rejected" | undefined>>({});

  async function act(id: string, status: "live" | "rejected") {
    let reason: string | undefined;
    if (status === "rejected") {
      const r = window.prompt("Reason for rejection (shown to the user):", "Content violates our posting guidelines.");
      if (r === null) return;
      reason = r.trim() || "Rejected by moderator";
    }
    setBusy((b) => ({ ...b, [id]: status }));
    try {
      await setStatusFn({ data: { id, status, rejection_reason: reason } });
      toast.success(status === "live" ? "Listing approved" : "Listing rejected");
      await qc.invalidateQueries({ queryKey: ["admin", "pending-ads"] });
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy((b) => ({ ...b, [id]: undefined }));
    }
  }

  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Moderation queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review listings awaiting approval. {rows.length} pending.</p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Listing</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No pending listings. All clear.</td></tr>
            ) : rows.map((r: any) => {
              const b = busy[r.id];
              return (
                <tr key={r.id} className="align-top">
                  <td className="max-w-md px-4 py-3">
                    <div className="font-semibold text-foreground">{r.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{r.body}</div>
                    <div className="mt-1 text-[10px] font-mono uppercase text-muted-foreground">#{r.short_id} · {r.categories?.name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.profiles?.display_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.cities?.name}, {r.cities?.states?.code}</td>
                  <td className="px-4 py-3 text-xs font-medium">{fmtPrice(r.price_cents, r.currency ?? "USD")}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => act(r.id, "live")} disabled={!!b} className="bg-brand text-brand-foreground hover:bg-brand/90">
                        {b === "live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(r.id, "rejected")} disabled={!!b}>
                        {b === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}