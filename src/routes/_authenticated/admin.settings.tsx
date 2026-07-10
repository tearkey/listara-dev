import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save, Download, Upload, RefreshCw, Heart } from "lucide-react";
import {
  getAllSettings, updateSettings, getSiteHealth, exportSnapshot, importSnapshot,
} from "@/lib/settings.functions";

type Section = "general" | "permalinks" | "seo" | "integrations" | "system" | "tools";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

const settingsOpts = queryOptions({
  queryKey: ["admin", "settings", "all"],
  queryFn: () => getAllSettings(),
  staleTime: 15_000,
});

function SettingsPage() {
  const [tab, setTab] = useState<Section>("general");
  const { data } = useQuery(settingsOpts);
  const qc = useQueryClient();
  const save = useServerFn(updateSettings);
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => { if (data) setDraft(data); }, [data]);

  async function handleSave(key: string) {
    await save({ data: { key, value: (draft[key] ?? {}) as Record<string, unknown> } });
    await qc.invalidateQueries({ queryKey: ["admin", "settings", "all"] });
  }

  const patch = (key: string, patchObj: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? {}), ...patchObj } }));

  const TABS: Array<{ id: Section; label: string }> = [
    { id: "general", label: "General & Privacy" },
    { id: "permalinks", label: "Permalinks" },
    { id: "seo", label: "SEO & Metadata" },
    { id: "integrations", label: "Integrations & Security" },
    { id: "system", label: "System" },
    { id: "tools", label: "System Tools" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Global Settings</h1>
          <p className="text-sm text-muted-foreground">Site-wide configuration.</p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-t-md px-3 py-2 text-xs ${
              tab === t.id ? "bg-card border border-b-transparent border-border text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "general" && (
        <Panel title="General & Privacy" onSave={() => handleSave("general")}>
          <Field label="Site title"      value={String(draft.general?.site_title ?? "")}       onChange={(v) => patch("general", { site_title: v })} />
          <Field label="Tagline"         value={String(draft.general?.tagline ?? "")}          onChange={(v) => patch("general", { tagline: v })} />
          <Field label="Timezone"        value={String(draft.general?.timezone ?? "")}         onChange={(v) => patch("general", { timezone: v })} />
          <Field label="Contact email"   value={String(draft.general?.contact_email ?? "")}    onChange={(v) => patch("general", { contact_email: v })} />
          <Field label="Privacy policy path" value={String(draft.general?.privacy_policy_path ?? "")} onChange={(v) => patch("general", { privacy_policy_path: v })} />
          <Field label="Terms path"      value={String(draft.general?.terms_path ?? "")}       onChange={(v) => patch("general", { terms_path: v })} />
        </Panel>
      )}

      {tab === "permalinks" && (
        <Panel title="Permalinks" onSave={() => handleSave("permalinks")}>
          <Field label="Ad URL pattern"       value={String(draft.permalinks?.ad_url_pattern ?? "")}       onChange={(v) => patch("permalinks", { ad_url_pattern: v })}
                 hint="Tokens: :city :category :slug :short_id :year :month" />
          <Field label="Blog URL pattern"     value={String(draft.permalinks?.blog_url_pattern ?? "")}     onChange={(v) => patch("permalinks", { blog_url_pattern: v })}
                 hint="Tokens: :year :month :slug" />
          <Field label="Category URL pattern" value={String(draft.permalinks?.category_url_pattern ?? "")} onChange={(v) => patch("permalinks", { category_url_pattern: v })} />
          <Toggle label="Trailing slash" checked={!!draft.permalinks?.trailing_slash} onChange={(v) => patch("permalinks", { trailing_slash: v })} />
        </Panel>
      )}

      {tab === "seo" && (
        <Panel title="SEO & Metadata (RankMath-style)" onSave={() => handleSave("seo")}>
          <Field label="Meta title suffix"         value={String(draft.seo?.default_meta_title_suffix ?? "")} onChange={(v) => patch("seo", { default_meta_title_suffix: v })} />
          <Field label="Default meta description"  value={String(draft.seo?.default_meta_description ?? "")}  onChange={(v) => patch("seo", { default_meta_description: v })} textarea />
          <Field label="Default OG image URL"      value={String(draft.seo?.default_og_image ?? "")}          onChange={(v) => patch("seo", { default_og_image: v })} />
          <Field label="Twitter handle"            value={String(draft.seo?.twitter_handle ?? "")}            onChange={(v) => patch("seo", { twitter_handle: v })} />
          <Field label="noindex paths (comma-separated)"
                 value={((draft.seo?.noindex_paths as string[]) ?? []).join(",")}
                 onChange={(v) => patch("seo", { noindex_paths: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Panel>
      )}

      {tab === "integrations" && (
        <Panel title="Integrations & Security" onSave={() => handleSave("integrations")}>
          <Field label="Google Tag Manager ID" value={String(draft.integrations?.gtm_id ?? "")} onChange={(v) => patch("integrations", { gtm_id: v })} placeholder="GTM-XXXXXX" />
          <Field label="GA4 measurement ID"    value={String(draft.integrations?.ga4_id ?? "")} onChange={(v) => patch("integrations", { ga4_id: v })} placeholder="G-XXXXXXXXXX" />
          <Field label="Cloudflare Zone ID"    value={String(draft.integrations?.cloudflare_zone_id ?? "")} onChange={(v) => patch("integrations", { cloudflare_zone_id: v })} />
          <p className="text-xs text-muted-foreground">
            Cloudflare API token is stored as the secret named{" "}
            <code>{String(draft.integrations?.cloudflare_api_token_secret_name ?? "CLOUDFLARE_API_TOKEN")}</code>.
            Add it via Backend → Secrets, or connect Cloudflare as an app connector.
          </p>
          <Toggle label="Firewall enabled" checked={!!draft.integrations?.firewall_enabled} onChange={(v) => patch("integrations", { firewall_enabled: v })} />
          <Field label="IP allowlist (comma-separated)"
                 value={((draft.integrations?.ip_allowlist as string[]) ?? []).join(",")}
                 onChange={(v) => patch("integrations", { ip_allowlist: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <Field label="IP blocklist (comma-separated)"
                 value={((draft.integrations?.ip_blocklist as string[]) ?? []).join(",")}
                 onChange={(v) => patch("integrations", { ip_blocklist: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Panel>
      )}

      {tab === "system" && (
        <Panel title="System" onSave={() => handleSave("system")}>
          <Toggle label="SVG upload enabled (requires storage bucket)" checked={!!draft.system?.svg_upload_enabled} onChange={(v) => patch("system", { svg_upload_enabled: v })} />
          <Toggle label="Strict SVG sanitization (recommended)"          checked={!!draft.system?.svg_sanitize_strict} onChange={(v) => patch("system", { svg_sanitize_strict: v })} />
          <Toggle label="Maintenance mode"                                checked={!!draft.system?.maintenance_mode}    onChange={(v) => patch("system", { maintenance_mode: v })} />
        </Panel>
      )}

      {tab === "tools" && <SystemTools />}
    </div>
  );
}

/* ------------------------------ System Tools ------------------------------ */
function SystemTools() {
  const health = useServerFn(getSiteHealth);
  const exp = useServerFn(exportSnapshot);
  const imp = useServerFn(importSnapshot);
  const [snap, setSnap] = useState<unknown>(null);
  const [status, setStatus] = useState<string>("");

  async function runHealth() {
    setStatus("Checking…");
    const h = await health();
    setSnap(h);
    setStatus("Site health OK.");
  }
  async function runExport() {
    setStatus("Building snapshot…");
    const s = await exp();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Snapshot downloaded.");
  }
  async function onImport(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const res = await imp({ data: { snapshot: parsed } });
    setStatus(`Imported. Keys updated: ${res.keys_updated}`);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">System Tools</h2>
      <div className="flex flex-wrap gap-2">
        <button onClick={runHealth} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
          <Heart className="h-4 w-4" /> Site health
        </button>
        <button onClick={runExport} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
          <Download className="h-4 w-4" /> Export snapshot (JSON)
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
          <Upload className="h-4 w-4" /> Import snapshot
          <input type="file" accept="application/json" hidden
                 onChange={(e) => e.target.files && onImport(e.target.files[0])} />
        </label>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      {snap ? (
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
          {JSON.stringify(snap, null, 2)}
        </pre>
      ) : null}
      <p className="text-xs text-muted-foreground">
        SQL-format dump/restore is intentionally not exposed; use the JSON snapshot above for config, and{" "}
        <span className="font-medium">Backend → Advanced → Export data</span> for full-table backups.
      </p>
    </div>
  );
}

/* -------------------------------- primitives ------------------------------- */
function Panel({ title, children, onSave }: { title: string; children: React.ReactNode; onSave: () => void }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button onClick={onSave}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs text-brand-foreground">
          <Save className="h-3.5 w-3.5" /> Save
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, hint, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; placeholder?: string; textarea?: boolean;
}) {
  const Comp: any = textarea ? "textarea" : "input";
  return (
    <label className="text-xs text-muted-foreground">
      <div className="mb-1">{label}</div>
      <Comp value={value} placeholder={placeholder}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
      {hint && <div className="mt-1 text-[10px]">{hint}</div>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// silence unused import in the initial ship
void RefreshCw;