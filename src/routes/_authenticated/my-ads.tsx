import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyAds, deleteMyAd, bumpMyAd } from "@/lib/ads.functions";
import { BRAND } from "@/lib/brand";
import { ArrowUp, Plus, Trash2, Eye, Sparkles, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-ads")({
  head: () => ({ meta: [{ title: `My ads — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: MyAdsPage,
});

function MyAdsPage() {
  const list = useServerFn(listMyAds);
  const del = useServerFn(deleteMyAd);
  const bump = useServerFn(bumpMyAd);
  const qc = useQueryClient();

  const { data: ads, isLoading } = useQuery({ queryKey: ["my-ads"], queryFn: () => list() });

  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const cityOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const a of (ads as any[]) ?? []) {
      const name = a.cities?.name;
      const code = a.cities?.states?.code;
      if (name) set.set(`${name}|${code ?? ""}`, `${name}${code ? `, ${code}` : ""}`);
    }
    return Array.from(set.entries()).map(([k, v]) => ({ value: k, label: v }));
  }, [ads]);

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, pending: 0, expired: 0, removed: 0, rejected: 0 } as Record<string, number>;
    for (const a of (ads as any[]) ?? []) {
      c.all += 1;
      const s = a.status as string;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [ads]);

  const filtered = useMemo(() => {
    return ((ads as any[]) ?? []).filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (cityFilter !== "all") {
        const key = `${a.cities?.name ?? ""}|${a.cities?.states?.code ?? ""}`;
        if (key !== cityFilter) return false;
      }
      return true;
    });
  }, [ads, cityFilter, statusFilter]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Ad removed"); qc.invalidateQueries({ queryKey: ["my-ads"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const bumpMut = useMutation({
    mutationFn: (id: string) => bump({ data: { id } }),
    onSuccess: () => { toast.success("Bumped to the top"); qc.invalidateQueries({ queryKey: ["my-ads"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My ads</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage every listing across cities — bump, promote, edit or remove.</p>
          </div>
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/post"><Plus className="h-4 w-4" /> Post new</Link>
          </Button>
        </div>

        {/* Status pills */}
        {ads && ads.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {[
              { k: "all", label: "All" },
              { k: "live", label: "Live" },
              { k: "pending", label: "Pending" },
              { k: "expired", label: "Expired" },
              { k: "removed", label: "Removed" },
            ].map((s) => {
              const active = statusFilter === s.k;
              const n = counts[s.k] ?? 0;
              return (
                <button
                  key={s.k}
                  onClick={() => setStatusFilter(s.k)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card text-muted-foreground hover:border-brand/50 hover:text-foreground"}`}
                >
                  {s.label} <span className="ml-1 opacity-70">({n})</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Filter by city" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cities</SelectItem>
                  {cityOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 text-sm text-muted-foreground">Loading…</div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            {!ads || ads.length === 0
              ? <>You haven't posted anything yet. <Link to="/post" className="text-brand font-semibold">Post your first ad</Link>.</>
              : <>No ads match those filters.</>}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filtered.map((ad: any) => {
              const stateSlug = ad.cities?.states?.slug;
              const citySlug = ad.cities?.slug;
              const catSlug = ad.categories?.slug;
              return (
                <div key={ad.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-base font-semibold">{ad.title}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ad.status === "live" ? "bg-brand/20 text-foreground" : ad.status === "pending" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>{ad.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ad.categories?.name} · {ad.cities?.name} · <Eye className="inline h-3 w-3" /> {ad.view_count}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ad.status === "live" && stateSlug && citySlug && catSlug && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/$state/$city/$category/$slug" params={{ state: stateSlug, city: citySlug, category: catSlug, slug: `${ad.slug}-${ad.short_id}` }}>View</Link>
                      </Button>
                    )}
                    {ad.status === "live" && (
                      <Button size="sm" variant="outline" onClick={() => bumpMut.mutate(ad.id)} disabled={bumpMut.isPending}>
                        <ArrowUp className="h-3 w-3" /> Bump
                      </Button>
                    )}
                    {ad.status === "live" && (
                      <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
                        <Link to="/promote/$id" params={{ id: ad.id }}><Sparkles className="h-3 w-3" /> Promote</Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remove this ad?")) delMut.mutate(ad.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}