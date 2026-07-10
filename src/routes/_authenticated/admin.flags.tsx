import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { listFeatureFlags, setFeatureFlag } from "@/lib/admin.functions";

const flagsOpts = queryOptions({
  queryKey: ["admin", "flags"],
  queryFn: () => listFeatureFlags(),
});

export const Route = createFileRoute("/_authenticated/admin/flags")({
  head: () => ({ meta: [{ title: "Feature flags — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(flagsOpts),
  component: AdminFlags,
});

function AdminFlags() {
  const { data: rows } = useSuspenseQuery(flagsOpts);
  const qc = useQueryClient();
  const setFlagFn = useServerFn(setFeatureFlag);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(key: string, enabled: boolean) {
    setBusy(key);
    try {
      await setFlagFn({ data: { key, enabled } });
      toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
      await qc.invalidateQueries({ queryKey: ["admin", "flags"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return (
    <section>
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">Feature flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toggle modules on and off across the site. Changes take effect immediately.</p>
      </header>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map((f: any) => (
          <div key={f.key} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold">{f.key}</div>
              <div className="text-xs text-muted-foreground">{f.description ?? "—"}</div>
            </div>
            <Switch checked={!!f.enabled} disabled={busy === f.key} onCheckedChange={(v) => toggle(f.key, v)} />
          </div>
        ))}
      </div>
    </section>
  );
}