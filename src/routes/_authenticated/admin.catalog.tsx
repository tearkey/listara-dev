import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2, MapPin, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  adminListCities,
  adminUpsertCity,
  adminDeleteCity,
  adminListCategories,
  adminUpsertCategory,
  adminDeleteCategory,
  adminUpsertSubcategory,
  adminDeleteSubcategory,
  adminListStates,
} from "@/lib/admin.catalog.functions";

const statesOpts = queryOptions({
  queryKey: ["admin", "states"],
  queryFn: () => adminListStates(),
  staleTime: 300_000,
});
const catsOpts = queryOptions({
  queryKey: ["admin", "categories"],
  queryFn: () => adminListCategories(),
});
const citiesOpts = (q: string, stateId: string) =>
  queryOptions({
    queryKey: ["admin", "cities", q, stateId],
    queryFn: () =>
      adminListCities({
        data: {
          q: q || undefined,
          stateId: stateId || undefined,
        },
      }),
  });

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  head: () => ({
    meta: [{ title: "Cities & Categories — Admin" }, { name: "robots", content: "noindex" }],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(statesOpts),
      context.queryClient.ensureQueryData(catsOpts),
    ]),
  component: CatalogAdmin,
});

function CatalogAdmin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Cities & Categories</h1>
        <p className="text-sm text-muted-foreground">
          Control where and how ads can be posted across the US.
        </p>
      </div>
      <Tabs defaultValue="cities">
        <TabsList>
          <TabsTrigger value="cities">
            <MapPin className="mr-1.5 h-4 w-4" /> Cities
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="mr-1.5 h-4 w-4" /> Categories
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cities" className="mt-4">
          <CitiesPanel />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CitiesPanel() {
  const { data: states } = useSuspenseQuery(statesOpts);
  const [q, setQ] = useState("");
  const [stateId, setStateId] = useState("");
  const { data: cities, refetch, isFetching } = useSuspenseQuery(citiesOpts(q, stateId));
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertCity);
  const deleteFn = useServerFn(adminDeleteCity);

  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    state_id: "",
    population: "",
    is_featured: false,
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function saveNew() {
    if (!draft.name || !draft.state_id) {
      toast.error("Name and state are required");
      return;
    }
    setBusy("new");
    try {
      await upsertFn({
        data: {
          name: draft.name.trim(),
          slug: draft.slug.trim() || undefined,
          state_id: draft.state_id,
          population: draft.population ? Number(draft.population) : null,
          is_featured: draft.is_featured,
        },
      });
      toast.success("City created");
      setDraft({ name: "", slug: "", state_id: "", population: "", is_featured: false });
      await qc.invalidateQueries({ queryKey: ["admin", "cities"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleFeatured(row: any) {
    setBusy(row.id);
    try {
      await upsertFn({
        data: {
          id: row.id,
          name: row.name,
          state_id: row.state_id,
          population: row.population,
          is_featured: !row.is_featured,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin", "cities"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this city? This cannot be undone.")) return;
    setBusy(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("City deleted");
      await qc.invalidateQueries({ queryKey: ["admin", "cities"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 font-medium">Add a city</div>
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>Slug (optional)</Label>
            <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          </div>
          <div>
            <Label>State</Label>
            <Select value={draft.state_id} onValueChange={(v) => setDraft({ ...draft, state_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Population</Label>
            <Input
              type="number"
              value={draft.population}
              onChange={(e) => setDraft({ ...draft, population: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.is_featured}
                onCheckedChange={(v) => setDraft({ ...draft, is_featured: v })}
              />
              <span className="text-sm">Featured</span>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={saveNew} disabled={busy === "new"}>
            {busy === "new" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Create city
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search cities…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={stateId || "all"} onValueChange={(v) => setStateId(v === "all" ? "" : v)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing {cities.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">Slug</th>
                <th className="px-2 py-2">Population</th>
                <th className="px-2 py-2">Featured</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c: any) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">{c.name}</td>
                  <td className="px-2 py-2">{c.states?.code ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{c.slug}</td>
                  <td className="px-2 py-2">{c.population ?? "—"}</td>
                  <td className="px-2 py-2">
                    <Switch
                      checked={!!c.is_featured}
                      onCheckedChange={() => toggleFeatured(c)}
                      disabled={busy === c.id}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(c.id)}
                      disabled={busy === c.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const { data: cats } = useSuspenseQuery(catsOpts);
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertCategory);
  const deleteFn = useServerFn(adminDeleteCategory);
  const upsertSubFn = useServerFn(adminUpsertSubcategory);
  const deleteSubFn = useServerFn(adminDeleteSubcategory);

  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    icon: "",
    sort_order: 0,
    is_paid_only: false,
    base_price_cents: 0,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [sub, setSub] = useState<Record<string, string>>({});

  async function createCategory() {
    if (!draft.name) return toast.error("Name required");
    setBusy("new");
    try {
      await upsertFn({ data: { ...draft, slug: draft.slug || undefined } });
      toast.success("Category created");
      setDraft({ name: "", slug: "", icon: "", sort_order: 0, is_paid_only: false, base_price_cents: 0 });
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveCategory(c: any) {
    setBusy(c.id);
    try {
      await upsertFn({
        data: {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          sort_order: c.sort_order,
          is_paid_only: c.is_paid_only,
          base_price_cents: c.base_price_cents,
        },
      });
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete category and all its subcategories?")) return;
    setBusy(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Deleted");
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function addSub(categoryId: string) {
    const name = sub[categoryId]?.trim();
    if (!name) return;
    setBusy(`sub-${categoryId}`);
    try {
      await upsertSubFn({ data: { category_id: categoryId, name } });
      setSub({ ...sub, [categoryId]: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function removeSub(id: string) {
    if (!confirm("Delete subcategory?")) return;
    setBusy(id);
    try {
      await deleteSubFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const sorted = useMemo(
    () => [...cats].sort((a: any, b: any) => a.sort_order - b.sort_order),
    [cats],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 font-medium">Add a category</div>
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>Icon</Label>
            <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input
              type="number"
              value={draft.sort_order}
              onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Base price ¢</Label>
            <Input
              type="number"
              value={draft.base_price_cents}
              onChange={(e) => setDraft({ ...draft, base_price_cents: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end gap-2">
            <Switch
              checked={draft.is_paid_only}
              onCheckedChange={(v) => setDraft({ ...draft, is_paid_only: v })}
            />
            <span className="text-sm">Paid only</span>
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={createCategory} disabled={busy === "new"}>
            <Plus className="mr-1.5 h-4 w-4" /> Create category
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((c: any) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label>Name</Label>
                <Input defaultValue={c.name} onChange={(e) => (c.name = e.target.value)} />
              </div>
              <div>
                <Label>Icon</Label>
                <Input defaultValue={c.icon ?? ""} onChange={(e) => (c.icon = e.target.value)} />
              </div>
              <div>
                <Label>Sort</Label>
                <Input
                  type="number"
                  defaultValue={c.sort_order}
                  onChange={(e) => (c.sort_order = Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Base ¢</Label>
                <Input
                  type="number"
                  defaultValue={c.base_price_cents}
                  onChange={(e) => (c.base_price_cents = Number(e.target.value))}
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  defaultChecked={c.is_paid_only}
                  onCheckedChange={(v) => (c.is_paid_only = v)}
                />
                <span className="text-sm">Paid</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => saveCategory(c)} disabled={busy === c.id}>
                <Save className="mr-1.5 h-4 w-4" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => remove(c.id)}
                disabled={busy === c.id}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
            </div>

            <div className="mt-4 rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Subcategories ({c.subcategories?.length ?? 0})
              </div>
              <div className="flex flex-wrap gap-2">
                {(c.subcategories ?? []).map((s: any) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs"
                  >
                    {s.name}
                    <button
                      onClick={() => removeSub(s.id)}
                      className="text-destructive hover:opacity-70"
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="New subcategory name"
                  value={sub[c.id] ?? ""}
                  onChange={(e) => setSub({ ...sub, [c.id]: e.target.value })}
                  className="max-w-xs"
                />
                <Button size="sm" onClick={() => addSub(c.id)} disabled={busy === `sub-${c.id}`}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}