import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { listMyAds, deleteMyAd, bumpMyAd } from "@/lib/ads.functions";
import { BRAND } from "@/lib/brand";
import { ArrowUp, Plus, Trash2, Eye } from "lucide-react";
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
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold">My ads</h1>
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/post"><Plus className="h-4 w-4" /> Post new</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="mt-8 text-sm text-muted-foreground">Loading…</div>
        ) : !ads || ads.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            You haven't posted anything yet. <Link to="/post" className="text-brand font-semibold">Post your first ad</Link>.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {ads.map((ad: any) => {
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