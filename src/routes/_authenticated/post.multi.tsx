import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BRAND } from "@/lib/brand";
import { listCategories } from "@/lib/catalog.functions";
import { listStatesWithCities, getMyCredits } from "@/lib/credits.functions";
import { createAd } from "@/lib/ads.functions";
import {
  ChevronDown, ChevronRight, MapPin, Wallet, Search as SearchIcon,
  ArrowLeft, ArrowRight, Check, Tag, FileText, Globe2,
} from "lucide-react";

const COST_CENTS = 10; // $0.10 per city

const STEPS = [
  { id: 1, label: "Pick cities", icon: Globe2 },
  { id: 2, label: "Category", icon: Tag },
  { id: 3, label: "Details", icon: FileText },
  { id: 4, label: "Review & Publish", icon: Check },
] as const;

export const Route = createFileRoute("/_authenticated/post/multi")({
  head: () => ({
    meta: [
      { title: `Post in multiple cities — ${BRAND.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PostMultiPage,
});

type StateNode = {
  id: string;
  code: string;
  name: string;
  slug: string;
  cities: { id: string; name: string; slug: string }[];
};

function PostMultiPage() {
  const navigate = useNavigate();
  const { data: states } = useSuspenseQuery(
    queryOptions({ queryKey: ["states-with-cities"], queryFn: () => listStatesWithCities() }),
  ) as { data: StateNode[] };
  const { data: categories } = useSuspenseQuery(
    queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() }),
  );
  const { data: credits } = useSuspenseQuery(
    queryOptions({ queryKey: ["my-credits"], queryFn: () => getMyCredits() }),
  );
  const createFn = useServerFn(createAd);

  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Record<string, { name: string; state: string }>>({});
  const [openState, setOpenState] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedCount = Object.keys(selected).length;
  const totalCents = selectedCount * COST_CENTS;
  const affordable = credits.balance_cents >= totalCents;

  const subcats = useMemo(() => {
    return (categories as any[]).find((c) => c.id === categoryId)?.subcategories ?? [];
  }, [categoryId, categories]);

  const filteredStates = useMemo(() => {
    if (!query.trim()) return states;
    const q = query.trim().toLowerCase();
    return states
      .map((s) => ({
        ...s,
        cities: s.cities.filter(
          (c) => c.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q,
        ),
      }))
      .filter((s) => s.cities.length > 0 || s.name.toLowerCase().includes(q));
  }, [states, query]);

  function toggleCity(state: StateNode, city: { id: string; name: string }) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[city.id]) delete next[city.id];
      else next[city.id] = { name: city.name, state: state.code };
      return next;
    });
  }

  function toggleAllInState(state: StateNode) {
    const allIn = state.cities.every((c) => selected[c.id]);
    setSelected((prev) => {
      const next = { ...prev };
      for (const c of state.cities) {
        if (allIn) delete next[c.id];
        else next[c.id] = { name: c.name, state: state.code };
      }
      return next;
    });
  }

  function clearAll() { setSelected({}); }

  function goNext() {
    if (step === 1 && selectedCount === 0) return toast.error("Select at least one city.");
    if (step === 1 && !affordable)
      return toast.error("Not enough credits — reduce selection or buy credits.");
    if (step === 2 && !categoryId) return toast.error("Pick a category.");
    if (step === 3 && (title.trim().length < 4 || body.trim().length < 20))
      return toast.error("Title (4+ chars) and description (20+ chars) required.");
    setStep((s) => Math.min(4, s + 1));
  }

  async function publish() {
    setSubmitting(true);
    try {
      const cityIds = Object.keys(selected);
      const result = await createFn({
        data: {
          title, body, category_id: categoryId,
          subcategory_id: subcategoryId || undefined,
          city_ids: cityIds,
          price_cents: price ? Math.round(parseFloat(price) * 100) : undefined,
          contact_email: email || undefined,
          contact_phone: phone || undefined,
        },
      });
      if ((result as any).status === "insufficient_credits") {
        toast.error("Not enough credits — buy credits to post.");
        setSubmitting(false);
        navigate({ to: "/credits" });
        return;
      }
      if (result.status === "rejected") {
        toast.error("Your ad was blocked by our policy filter. Please revise and try again.");
        setSubmitting(false);
        return;
      }
      const posted = (result as any).posted_count ?? 1;
      const total = (posted * COST_CENTS) / 100;
      toast.success(`🎉 Published in ${posted} ${posted === 1 ? "city" : "cities"}! $${total.toFixed(2)} deducted.`);
      navigate({ to: "/my-ads" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to post");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/post" className="hover:text-brand">Post an ad</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Multiple cities</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Post in multiple cities</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select cities across states — $0.10 each. Total updates as you pick.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</div>
            <div className="flex items-center gap-1.5 font-display text-base font-bold">
              <Wallet className="h-4 w-4 text-brand" />${(credits.balance_cents / 100).toFixed(2)}
            </div>
            <Link to="/credits" className="text-[11px] font-semibold text-brand hover:underline">Add credits</Link>
          </div>
        </div>

        {/* Stepper */}
        <ol className="mt-6 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (done) setStep(s.id); }}
                  disabled={!done}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active ? "border-brand bg-brand text-brand-foreground"
                    : done ? "border-brand/50 bg-brand/10 text-brand hover:bg-brand/20"
                    : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && (<div className={`h-px flex-1 ${done ? "bg-brand/50" : "bg-border"}`} />)}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          {step === 1 && (
            <div>
              <h2 className="font-display text-xl font-bold">Pick your cities</h2>
              <p className="text-sm text-muted-foreground">Expand a state and tick cities. Each city adds $0.10 to your total.</p>

              <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2">
                <SearchIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search state or city…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {selectedCount > 0 && (
                  <button
                    type="button" onClick={clearAll}
                    className="text-xs font-semibold text-brand hover:underline"
                  >Clear all</button>
                )}
              </div>

              {selectedCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(selected).map(([id, v]) => (
                    <button
                      key={id}
                      onClick={() => setSelected((p) => { const n = { ...p }; delete n[id]; return n; })}
                      className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/20"
                    >
                      {v.name}, {v.state}
                      <span className="text-brand/70">×</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 max-h-[520px] overflow-y-auto rounded-xl border border-border">
                {filteredStates.map((s) => {
                  const isOpen = openState === s.id || query.trim().length > 0;
                  const stateSelected = s.cities.filter((c) => selected[c.id]).length;
                  const allIn = stateSelected > 0 && stateSelected === s.cities.length;
                  return (
                    <div key={s.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenState(isOpen && openState === s.id ? null : s.id)}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-secondary/40"
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          {s.name} <span className="text-xs font-normal text-muted-foreground">({s.code})</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stateSelected > 0 && <span className="font-semibold text-brand">{stateSelected} selected · </span>}
                          {s.cities.length} cities
                        </span>
                      </button>
                      {isOpen && s.cities.length > 0 && (
                        <div className="border-t border-border bg-secondary/20 px-4 py-3">
                          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-brand">
                            <Checkbox checked={allIn} onCheckedChange={() => toggleAllInState(s)} />
                            Select all in {s.name}
                          </label>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {s.cities.map((c) => (
                              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-background">
                                <Checkbox
                                  checked={Boolean(selected[c.id])}
                                  onCheckedChange={() => toggleCity(s, c)}
                                />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="text-[11px] text-muted-foreground">($0.10)</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected</div>
                  <div className="font-display text-lg font-bold">{selectedCount} {selectedCount === 1 ? "city" : "cities"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
                  <div className={`font-display text-2xl font-bold ${affordable ? "text-brand" : "text-destructive"}`}>
                    ${(totalCents / 100).toFixed(2)}
                  </div>
                  {!affordable && <div className="text-[11px] text-destructive">Need ${((totalCents - credits.balance_cents) / 100).toFixed(2)} more</div>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold">Choose a category</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(""); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>
                      {(categories as any[]).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {subcats.length > 0 && (
                  <div>
                    <Label>Subcategory (optional)</Label>
                    <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a subcategory" /></SelectTrigger>
                      <SelectContent>
                        {subcats.map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold">Tell us about it</h2>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short, honest, specific" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="body">Description</Label>
                <Textarea id="body" minLength={20} maxLength={8000} rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details, condition, meetup preference…" className="mt-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="price">Price (USD, optional)</Label>
                  <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold">Review & Publish</h2>
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                <div className="font-semibold">{title}</div>
                <p className="mt-1 line-clamp-3 text-muted-foreground">{body}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(selected).slice(0, 20).map(([id, v]) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                      <MapPin className="h-3 w-3" /> {v.name}, {v.state}
                    </span>
                  ))}
                  {selectedCount > 20 && <span className="text-xs text-muted-foreground">+{selectedCount - 20} more</span>}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-brand/5 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">You'll be charged</div>
                  <div className="font-display text-2xl font-bold text-brand">${(totalCents / 100).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">for {selectedCount} city {selectedCount === 1 ? "listing" : "listings"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">After posting</div>
                  <div className="font-display text-base font-bold">${((credits.balance_cents - totalCents) / 100).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">balance remaining</div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={goNext} className="bg-brand text-brand-foreground hover:bg-brand/90">
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={publish} disabled={submitting || !affordable} className="h-11 px-6 bg-brand text-brand-foreground hover:bg-brand/90">
                {submitting ? "Publishing…" : <>Pay ${(totalCents / 100).toFixed(2)} & Publish <Check className="h-4 w-4 ml-1" /></>}
              </Button>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
