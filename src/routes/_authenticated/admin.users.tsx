import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, ShieldPlus, ShieldMinus, Ban, CheckCircle2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listUsers, setUserRole, setUserBanned, adjustUserCredits } from "@/lib/admin.functions";

const usersOpts = (q?: string) =>
  queryOptions({
    queryKey: ["admin", "users", q ?? ""],
    queryFn: () => listUsers({ data: { q } }),
  });

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(usersOpts()),
  component: AdminUsers,
});

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function AdminUsers() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState<string | undefined>(undefined);
  const { data: rows } = useSuspenseQuery(usersOpts(applied));
  const qc = useQueryClient();
  const setRoleFn = useServerFn(setUserRole);
  const setBannedFn = useServerFn(setUserBanned);
  const adjustFn = useServerFn(adjustUserCredits);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleAdmin(userId: string, hasAdmin: boolean) {
    setBusy(userId);
    try {
      await setRoleFn({ data: { user_id: userId, role: "admin", grant: !hasAdmin } });
      toast.success(hasAdmin ? "Admin revoked" : "Admin granted");
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function toggleBan(userId: string, banned: boolean) {
    setBusy(userId);
    try {
      await setBannedFn({ data: { user_id: userId, banned: !banned } });
      toast.success(banned ? "User unbanned" : "User banned");
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function adjust(userId: string, sign: 1 | -1) {
    const raw = window.prompt(`Amount in USD to ${sign > 0 ? "credit" : "debit"}:`, "5.00");
    if (!raw) return;
    const dollars = parseFloat(raw);
    if (!Number.isFinite(dollars) || dollars <= 0) { toast.error("Invalid amount"); return; }
    const reason = window.prompt("Reason:", sign > 0 ? "Manual credit" : "Manual debit") ?? "adjustment";
    setBusy(userId);
    try {
      await adjustFn({ data: { user_id: userId, delta_cents: sign * Math.round(dollars * 100), reason } });
      toast.success("Balance updated");
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">{rows.length} shown.</p>
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim() || undefined); }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search display name…" className="pl-8" />
          </div>
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r: any) => {
              const roles: string[] = (r.user_roles ?? []).map((x: any) => x.role);
              const hasAdmin = roles.includes("admin");
              const credits = Array.isArray(r.user_credits) ? (r.user_credits[0]?.balance_cents ?? 0) : (r.user_credits?.balance_cents ?? 0);
              const b = busy === r.id;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.display_name ?? "—"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.id}</div>
                    {r.is_banned ? <span className="mt-1 inline-block rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">BANNED</span> : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {roles.length === 0 ? <span className="text-muted-foreground">user</span> : roles.map((x) => (
                      <span key={x} className="mr-1 rounded bg-secondary px-2 py-0.5">{x}</span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{money(credits)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={b} onClick={() => adjust(r.id, 1)} title="Credit"><Plus className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" disabled={b} onClick={() => adjust(r.id, -1)} title="Debit"><Minus className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" disabled={b} onClick={() => toggleAdmin(r.id, hasAdmin)} title={hasAdmin ? "Revoke admin" : "Grant admin"}>
                        {hasAdmin ? <ShieldMinus className="h-3.5 w-3.5" /> : <ShieldPlus className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant={r.is_banned ? "outline" : "destructive"} disabled={b} onClick={() => toggleBan(r.id, r.is_banned)} title={r.is_banned ? "Unban" : "Ban"}>
                        {b ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : r.is_banned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
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