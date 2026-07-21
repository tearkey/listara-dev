import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Puzzle, Power, Settings2, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  adminListModules,
  setModuleActive,
  updateModuleConfig,
  uninstallModule,
} from "@/lib/modules.functions";
import { BRAND } from "@/lib/brand";

const modulesOpts = queryOptions({
  queryKey: ["admin", "modules"],
  queryFn: () => adminListModules(),
});

function ModuleCard({ mod }: { mod: any }) {
  const qc = useQueryClient();
  const activateFn = useServerFn(setModuleActive);
  const configFn = useServerFn(updateModuleConfig);
  const uninstallFn = useServerFn(uninstallModule);
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configText, setConfigText] = useState(() => JSON.stringify(mod.config ?? {}, null, 2));

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await qc.invalidateQueries({ queryKey: ["admin", "modules"] });
      await qc.invalidateQueries({ queryKey: ["modules", "active"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function saveConfig() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configText);
    } catch {
      toast.error("Settings must be valid JSON");
      return;
    }
    void run("Settings saved", () => configFn({ data: { slug: mod.slug, config: parsed } }));
  }

  const bindings: Array<{ binding_type: string; target: string }> = mod.module_bindings ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold">{mod.name}</span>
            <Badge variant="outline" className="text-xs">v{mod.version}</Badge>
            {mod.is_active ? (
              <Badge className="bg-green-100 text-green-900 hover:bg-green-100">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
          {bindings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bindings.map((b, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={`${b.binding_type} binding`}
                >
                  {b.binding_type}: {b.target}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant={mod.is_active ? "outline" : "default"}
            disabled={busy}
            onClick={() =>
              run(
                mod.is_active ? `${mod.name} deactivated` : `${mod.name} activated`,
                () => activateFn({ data: { slug: mod.slug, active: !mod.is_active } }),
              )
            }
          >
            <Power className="mr-1.5 h-4 w-4" />
            {mod.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowConfig((v) => !v)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Settings
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Uninstall ${mod.name}? This deactivates the plugin and wipes its settings. Content it created (e.g. blog posts) is kept.`,
                )
              )
                void run(`${mod.name} uninstalled`, () => uninstallFn({ data: { slug: mod.slug } }));
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Uninstall
          </Button>
        </div>
      </div>

      {showConfig && (
        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Plugin settings (JSON)
          </div>
          <Textarea
            rows={6}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            className="font-mono text-xs"
          />
          <Button size="sm" className="mt-2" disabled={busy} onClick={saveConfig}>
            <Save className="mr-1.5 h-4 w-4" /> Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

function ModulesPage() {
  const { data: modules } = useSuspenseQuery(modulesOpts);
  const plugins = modules.filter((m: any) => m.kind === "plugin");
  const themes = modules.filter((m: any) => m.kind === "theme");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Puzzle className="h-5 w-5 text-brand" />
        <h1 className="font-display text-2xl font-bold">Plugins</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Turn site features on and off. Changes apply within seconds — no redeploy needed. Plugin
        code ships with the app; new plugins appear here after a release adds them.
      </p>
      <div className="space-y-3">
        {plugins.map((m: any) => (
          <ModuleCard key={m.id} mod={m} />
        ))}
        {plugins.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No plugins registered yet.
          </div>
        )}
      </div>
      {themes.length > 0 && (
        <>
          <h2 className="pt-2 font-display text-xl font-bold">Themes</h2>
          <div className="space-y-3">
            {themes.map((m: any) => (
              <ModuleCard key={m.id} mod={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/modules")({
  component: ModulesPage,
  head: () => ({ meta: [{ title: `Plugins — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
