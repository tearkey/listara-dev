import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAllAds, removeAd } from "@/lib/admin.functions";

type Status = "pending" | "live" | "rejected" | "expired" | "removed" | "draft";

const adsOpts = (status?: Status) =>
  queryOptions({
    queryKey: ["admin", "ads", status ?? "all"],
    queryFn: () => listAllAds({ data: { status } }),
  });

export const Route = createFileRoute("/_authenticated/admin/ads")({
  head: () => ({ meta: [{ title: "Ads — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(adsOpts()),
  component: AdminAds,
});

const TABS: { key?: Status; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "live", label: "Live" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "removed", label: "Removed" },
];

function AdminAds() {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const { data: rows } = useSuspenseQuery(adsOpts(status));
  const qc = useQueryClient();
  const removeFn = useServerFn(removeAd);
  const [busy, setBusy] = useState<string | null>(null);

  async function doRemove(id: string) {
    const reason = window.prompt("Reason for removal:", "Removed by admin");
    if (reason === null) return;
    setBusy(id);
    try {
      await removeFn({ data: { id, reason: reason || undefined } });
      toast.success("Ad removed");
      await qc.invalidateQueries({ queryKey: ["admin", "ads"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Ads</h1>
        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.label} onClick={() => setStatus(t.key)} className={`rounded-full px-3 py-1 text-xs ${status === t.key ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
          ))}
        </div>
      </header>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No ads.</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">#{r.short_id} · {r.categories?.name}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.profiles?.display_name ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{r.cities?.name}, {r.cities?.states?.code}</td>
                <td className="px-4 py-3 text-xs"><span className="rounded bg-secondary px-2 py-0.5">{r.status}</span></td>
                <td className="px-4 py-3 text-xs">{r.tier}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    {r.status !== "removed" ? (
                      <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => doRemove(r.id)}>
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
                      </Button>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}