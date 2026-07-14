import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAllAds, removeAd, explainAdRank } from "@/lib/admin.functions";

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
  const explainFn = useServerFn(explainAdRank);
  const [busy, setBusy] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Awaited<ReturnType<typeof explainAdRank>> | null>(null);

  async function doExplain(id: string) {
    setExplaining(id);
    try {
      const r = await explainFn({ data: { id } });
      setExplanation(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setExplaining(null); }
  }

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
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={explaining === r.id} onClick={() => doExplain(r.id)} title="Explain ranking score">
                        {explaining === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Why?
                      </Button>
                      {r.status !== "removed" ? (
                        <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => doRemove(r.id)}>
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {explanation && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setExplanation(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">Ranking breakdown</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">#{explanation.short_id} · {explanation.title}</p>
              </div>
              <button aria-label="Close" onClick={() => setExplanation(null)} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Tier</div><div className="font-semibold">{explanation.tier}</div></div>
              <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Age</div><div className="font-semibold">{explanation.age_days}d</div></div>
              <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Views · Reports</div><div className="font-semibold">{explanation.views} · {explanation.reports}</div></div>
            </div>
            <ul className="mt-4 divide-y divide-border">
              {explanation.components.map((c) => (
                <li key={c.label} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <div>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.explain}</div>
                  </div>
                  <div className={`font-mono text-sm tabular-nums ${c.value < 0 ? "text-destructive" : c.value > 0 ? "text-brand-strong" : "text-muted-foreground"}`}>{c.value >= 0 ? "+" : ""}{c.value}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
              <span className="text-sm font-semibold">Total score</span>
              <span className="font-mono text-lg font-bold text-brand-strong">{explanation.score}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}