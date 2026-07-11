import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, RefreshCw, PlusCircle, Trash2, KeyRound } from "lucide-react";
import {
  listSecurityRuns,
  recordSecurityRun,
  getSecurityDiff,
  deleteSecurityRun,
  type Finding,
  type ScanRun,
} from "@/lib/security-scans.functions";

const runsOpts = queryOptions({
  queryKey: ["admin", "security", "runs"],
  queryFn: () => listSecurityRuns(),
  staleTime: 15_000,
});

const diffOpts = queryOptions({
  queryKey: ["admin", "security", "diff"],
  queryFn: () => getSecurityDiff(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({ meta: [{ title: "Security scans — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(runsOpts),
      context.queryClient.ensureQueryData(diffOpts),
    ]);
  },
  component: AdminSecurityPage,
});

function sevClass(sev: string) {
  switch (sev) {
    case "critical": return "bg-destructive/15 text-destructive";
    case "high": return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
    case "medium": return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "low": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function AdminSecurityPage() {
  const { data: runs } = useSuspenseQuery(runsOpts);
  const { data: diff } = useSuspenseQuery(diffOpts);
  const qc = useQueryClient();
  const record = useServerFn(recordSecurityRun);
  const del = useServerFn(deleteSecurityRun);
  const [notes, setNotes] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "security", "runs"] }),
      qc.invalidateQueries({ queryKey: ["admin", "security", "diff"] }),
    ]);
  }

  async function saveSnapshot() {
    setBusy(true);
    try {
      let findings: Finding[] = [];
      const trimmed = pasted.trim();
      if (trimmed) {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : parsed.findings;
        if (!Array.isArray(arr)) throw new Error("Expected an array of findings or { findings: [...] }");
        findings = arr as Finding[];
      }
      await record({ data: { findings, notes: notes || null } });
      setNotes(""); setPasted("");
      toast.success(`Snapshot saved (${findings.length} findings).`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function removeRun(id: string) {
    if (!confirm("Delete this scan snapshot?")) return;
    await del({ data: { id } });
    toast.success("Snapshot deleted.");
    await refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Security scans</h1>
          <p className="text-sm text-muted-foreground">
            Persisted snapshots of Lovable's security scanner. Compare runs to confirm each
            intentional <code className="rounded bg-muted px-1">SECURITY DEFINER</code> permission.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <DiffPanel
        latest={diff.latest}
        previous={diff.previous}
        added={diff.diff.added}
        removed={diff.diff.removed}
        unchanged={diff.diff.unchanged}
        definerHighlights={diff.definerHighlights}
      />

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold inline-flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> Record new snapshot
        </h2>
        <p className="text-xs text-muted-foreground">
          Paste the JSON output from the security scan (either <code>[…]</code> or{" "}
          <code>{"{ findings: [...] }"}</code>). Leave blank to save a clean run (0 findings).
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={6}
          placeholder='[{"internal_id":"...","scanner_name":"supabase","title":"...","severity":"medium"}]'
          className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={saveSnapshot}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs text-brand-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save snapshot"}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">History</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Critical / High / Med / Low</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No snapshots yet.</td></tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.total}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-destructive">{r.critical}</span> /{" "}
                    <span className="text-orange-600 dark:text-orange-400">{r.high}</span> /{" "}
                    <span className="text-amber-600 dark:text-amber-400">{r.medium}</span> /{" "}
                    <span className="text-muted-foreground">{r.low}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRun(r.id)}
                      aria-label="Delete snapshot"
                      className="inline-flex items-center rounded-md p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DiffPanel(props: {
  latest: ScanRun | null;
  previous: ScanRun | null;
  added: Finding[];
  removed: Finding[];
  unchanged: Finding[];
  definerHighlights: Finding[];
}) {
  const { latest, previous, added, removed, unchanged, definerHighlights } = props;

  if (!latest) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        <ShieldAlert className="mx-auto mb-2 h-5 w-5" />
        No scans recorded yet. Save a snapshot below to start tracking changes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Latest total" value={latest.total} sub={new Date(latest.created_at).toLocaleString()} />
        <Stat label="Newly added" value={added.length} tone={added.length ? "warn" : "ok"} />
        <Stat label="Resolved since previous" value={removed.length} tone="ok" />
      </div>

      {definerHighlights.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h3 className="font-display text-sm font-semibold inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> SECURITY DEFINER permissions
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirm each of these is intentional. If not, revoke EXECUTE from the caller role.
          </p>
          <FindingList findings={definerHighlights} />
        </section>
      )}

      {(added.length > 0 || removed.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {added.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-display text-sm font-semibold">Added since previous run</h3>
              <FindingList findings={added} />
            </section>
          )}
          {removed.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-display text-sm font-semibold">Removed since previous run</h3>
              <FindingList findings={removed} />
            </section>
          )}
        </div>
      )}

      {previous == null && (
        <p className="text-xs text-muted-foreground">
          Only one snapshot recorded — record another after your next scan to see a diff.
        </p>
      )}

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Unchanged findings ({unchanged.length})
        </summary>
        <FindingList findings={unchanged} />
      </details>
    </div>
  );
}

function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p className="mt-2 text-xs text-muted-foreground">None.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {findings.map((f) => (
        <li key={`${f.scanner_name}:${f.internal_id}`} className="rounded-md border border-border bg-background p-2">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${sevClass(f.severity)}`}>{f.severity}</span>
            <span className="text-sm font-medium">{f.title}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {f.scanner_name} · <code>{f.internal_id}</code>{f.target ? ` · ${f.target}` : ""}
          </div>
          {f.description && <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "ok" | "warn" }) {
  const toneCls = tone === "warn" ? "text-orange-600 dark:text-orange-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}