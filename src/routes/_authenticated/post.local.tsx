import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCategories, listFeaturedCities, listStates } from "@/lib/catalog.functions";
import { createAd } from "@/lib/ads.functions";
import { CategoryAttrFields, type AttrValues } from "@/components/category-attr-fields";
import { getMyCredits } from "@/lib/credits.functions";
import { useServerFn } from "@tanstack/react-start";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, MapPin, Tag, FileText, Image as ImageIcon,
  UploadCloud, X, Eye, Pin, Star, ArrowUp, Wallet,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Location & Category", icon: MapPin },
  { id: 2, label: "Details", icon: FileText },
  { id: 3, label: "Photos", icon: ImageIcon },
  { id: 4, label: "Review & Publish", icon: Eye },
] as const;

const MAX_IMAGES = 8;
const POST_COST_CENTS = 10; // $0.10 per city

export const Route = createFileRoute("/_authenticated/post/local")({
  head: () => ({ meta: [{ title: `Post an ad — one city — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: PostPage,
});

function PostPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createAd);
  const { data: categories } = useSuspenseQuery(queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() }));
  const { data: cities } = useSuspenseQuery(queryOptions({ queryKey: ["featured-cities"], queryFn: () => listFeaturedCities() }));
  const { data: _states } = useSuspenseQuery(queryOptions({ queryKey: ["states"], queryFn: () => listStates() }));
  const { data: credits } = useSuspenseQuery(queryOptions({ queryKey: ["my-credits"], queryFn: () => getMyCredits() }));

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [neighborhood, setNeighborhood] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; name: string; size: number }>>([]);
  const [upgrades, setUpgrades] = useState({ bumped: false, featured: false, sticky: false });
  const [submitting, setSubmitting] = useState(false);
  const [attrs, setAttrs] = useState<AttrValues>({});
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  const subcats = useMemo(() => {
    return categories.find((c: any) => c.id === categoryId)?.subcategories ?? [];
  }, [categoryId, categories]);

  const selectedCity = cities.find((c: any) => c.id === cityId);
  const selectedCategory = categories.find((c: any) => c.id === categoryId);
  const selectedSub = subcats.find((s: any) => s.id === subcategoryId);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { photos.forEach((p) => URL.revokeObjectURL(p.url)); };
  }, [photos]);

  function addFiles(files: FileList | File[]) {
    const next = [...photos];
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      if (next.length >= MAX_IMAGES) return;
      next.push({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        url: URL.createObjectURL(f),
        name: f.name,
        size: f.size,
      });
    });
    setPhotos(next);
  }

  function removePhoto(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    setPhotos(photos.filter((x) => x.id !== id));
  }

  function canAdvance(from: number): boolean {
    if (from === 1) return Boolean(cityId && categoryId);
    if (from === 2) {
      if (selectedCategory?.is_adult && !adultConfirmed) return false;
      return title.trim().length >= 4 && body.trim().length >= 20;
    }
    return true;
  }

  function goNext() {
    if (!canAdvance(step)) {
      toast.error(
        step === 1
          ? "Pick a city and category to continue."
          : selectedCategory?.is_adult && !adultConfirmed
            ? "You must confirm the 18+ statement to post in this category."
            : "Title (4+ chars) and description (20+ chars) are required.",
      );
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }
  function goBack() { setStep((s) => Math.max(1, s - 1)); }

  async function handlePublish() {
    if (!cityId || !categoryId || title.length < 4 || body.length < 20) {
      toast.error("Please fill in title, description, city, and category.");
      return;
    }
    setSubmitting(true);
    try {
      const fullBody = neighborhood.trim()
        ? `📍 Neighborhood: ${neighborhood.trim()}\n\n${body}`
        : body;
      const result = await createFn({
        data: {
          title, body: fullBody, city_ids: [cityId], category_id: categoryId,
          subcategory_id: subcategoryId || undefined,
          price_cents: price ? Math.round(parseFloat(price) * 100) : undefined,
          contact_email: email || undefined,
          contact_phone: phone || undefined,
          attrs: Object.keys(attrs).length ? attrs : undefined,
        },
      });
      if (result.status === "insufficient_credits") {
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
      if (result.status === "pending") {
        toast.success("🎉 Ad submitted — pending quick moderator review.");
      } else {
        toast.success(`🎉 Ad is live! $${(POST_COST_CENTS/100).toFixed(2)} deducted.`);
      }
      navigate({ to: "/my-ads" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to post");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Post a free ad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reach neighbors in your city. Step {step} of {STEPS.length}.
        </p>

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
                    active
                      ? "border-brand bg-brand text-brand-foreground"
                      : done
                        ? "border-brand/50 bg-brand/10 text-brand hover:bg-brand/20"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${done ? "bg-brand/50" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">Where & what?</h2>
                <p className="text-sm text-muted-foreground">Pick your city and the category that fits best.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-brand" /> Location</Label>
                  <Select value={cityId} onValueChange={setCityId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose your city" /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}, {c.states.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1"><Tag className="h-4 w-4 text-brand" /> Category</Label>
                  <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(""); setAttrs({}); setAdultConfirmed(false); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {subcats.length > 0 && (
                <div>
                  <Label>Subcategory (optional)</Label>
                  <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a subcategory" /></SelectTrigger>
                    <SelectContent>
                      {subcats.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">Tell us about it</h2>
                <p className="text-sm text-muted-foreground">Honest details and a clear title get faster replies.</p>
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title" maxLength={120} value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. IKEA Malm desk, like new"
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{title.length}/120</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="price">Price / Rate (USD)</Label>
                  <Input id="price" type="number" step="0.01" min="0" value={price}
                         onChange={(e) => setPrice(e.target.value)} placeholder="0.00 — leave blank if free" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="hood">Location description</Label>
                  <Input id="hood" maxLength={80} value={neighborhood}
                         onChange={(e) => setNeighborhood(e.target.value)}
                         placeholder="e.g. Mission District, near 24th St" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="body">Description</Label>
                <Textarea id="body" minLength={20} maxLength={8000} rows={7} value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Condition, what's included, why you're selling, where to meet…" className="mt-1" />
                <p className="mt-1 text-[11px] text-muted-foreground">{body.length}/8000</p>
              </div>
              <CategoryAttrFields
                categorySlug={selectedCategory?.slug}
                values={attrs}
                onChange={setAttrs}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="email">Contact email (optional)</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Contact phone (optional)</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
                </div>
              </div>
              {selectedCategory?.is_adult && (
                <label className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={adultConfirmed}
                    onChange={(e) => setAdultConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    I confirm I am 18 or older, everyone referenced in this ad is 18 or older, and
                    this post follows the site rules for this category.
                  </span>
                </label>
              )}
            </div>
          )}

          {step === 3 && (
            <PhotosStep
              photos={photos}
              onAdd={addFiles}
              onRemove={removePhoto}
              max={MAX_IMAGES}
            />
          )}

          {step === 4 && (
            <ReviewStep
              title={title}
              body={body}
              price={price}
              neighborhood={neighborhood}
              email={email}
              phone={phone}
              cityLabel={selectedCity ? `${selectedCity.name}, ${selectedCity.states.code}` : "—"}
              categoryLabel={selectedCategory?.name ?? "—"}
              subLabel={selectedSub?.name}
              photos={photos}
              upgrades={upgrades}
              setUpgrades={setUpgrades}
              balanceCents={credits.balance_cents}
              costCents={POST_COST_CENTS}
            />
          )}

          {/* Wizard footer */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={goBack} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={goNext} className="bg-brand text-brand-foreground hover:bg-brand/90">
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={handlePublish} disabled={submitting} className="h-11 px-6 bg-brand text-brand-foreground hover:bg-brand/90">
                {submitting ? "Publishing…" : <>Publish Ad <Check className="h-4 w-4 ml-1" /></>}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 px-1 text-[11px] text-muted-foreground">
          By posting, you agree to our community rules — no prohibited content, no harassment, no scams.
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}

function PhotosStep({
  photos, onAdd, onRemove, max,
}: {
  photos: Array<{ id: string; url: string; name: string; size: number }>;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Add photos</h2>
        <p className="text-sm text-muted-foreground">Listings with photos get up to 3× more responses. Up to {max} images.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-brand bg-brand/5" : "border-border bg-secondary/30 hover:border-brand hover:bg-brand/5"
        }`}
      >
        <UploadCloud className="h-10 w-10 text-brand" />
        <p className="mt-3 font-medium">Drag & drop photos here</p>
        <p className="text-xs text-muted-foreground">or click to choose files · JPG, PNG, WEBP</p>
        <input
          ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files) onAdd(e.target.files); e.target.value = ""; }}
        />
      </div>

      {photos.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{photos.length} / {max} photos · first photo is the cover</span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photos.map((p, i) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary/40">
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Photos are previewed locally on this device. Uploads to your account go live after we wire image hosting.
      </p>
    </div>
  );
}

function ReviewStep({
  title, body, price, neighborhood, email, phone,
  cityLabel, categoryLabel, subLabel, photos, upgrades, setUpgrades,
  balanceCents, costCents,
}: {
  title: string;
  body: string;
  price: string;
  neighborhood: string;
  email: string;
  phone: string;
  cityLabel: string;
  categoryLabel: string;
  subLabel?: string;
  photos: Array<{ id: string; url: string; name: string }>;
  upgrades: { bumped: boolean; featured: boolean; sticky: boolean };
  setUpgrades: (u: { bumped: boolean; featured: boolean; sticky: boolean }) => void;
  balanceCents: number;
  costCents: number;
}) {
  const priceLabel = price ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(parseFloat(price)) : null;
  const cover = photos[0];
  const affordable = balanceCents >= costCents;
  const remaining = balanceCents - costCents;

  const upgradeOptions = [
    { key: "bumped" as const, label: "Bump to top", price: "$2.99", desc: "Resurfaces your ad above newer posts for 24h.", icon: ArrowUp },
    { key: "featured" as const, label: "Featured", price: "$6.99", desc: "Highlighted with a brand badge for 7 days.", icon: Star },
    { key: "sticky" as const, label: "Pin to top", price: "$14.99", desc: "Sticky at the top of your category for 7 days.", icon: Pin },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">Review your ad</h2>
        <p className="text-sm text-muted-foreground">This is what neighbors will see. Make any final tweaks by stepping back.</p>
      </div>

      {/* Cost + credit summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Publishing in</div>
          <div className="mt-0.5 inline-flex items-center gap-1 font-semibold"><MapPin className="h-3.5 w-3.5 text-brand" /> {cityLabel}</div>
        </div>
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">You'll be charged</div>
          <div className="font-display text-xl font-bold text-brand">${(costCents / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Credits after posting</div>
          <div className={`inline-flex items-center gap-1 font-display text-xl font-bold ${affordable ? "text-foreground" : "text-destructive"}`}>
            <Wallet className="h-4 w-4 text-brand" /> ${(Math.max(0, remaining) / 100).toFixed(2)}
          </div>
          {!affordable && (
            <div className="mt-0.5 text-[11px] text-destructive">
              Not enough — <Link to="/credits" className="underline">buy credits</Link>.
            </div>
          )}
        </div>
      </div>

      {/* Live preview card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex gap-3 p-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary/60 sm:h-28 sm:w-28">
            {cover ? (
              <img src={cover.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-semibold leading-snug line-clamp-2">{title || "Your ad title"}</h3>
              {priceLabel && (
                <span className="shrink-0 rounded-md bg-secondary/80 px-2 py-0.5 text-sm font-bold">{priceLabel}</span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {body || "Your description will appear here."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{categoryLabel}</span>
              {subLabel && <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{subLabel}</span>}
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {neighborhood ? `${neighborhood} · ` : ""}{cityLabel}</span>
              <span>· just now</span>
            </div>
          </div>
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 border-t border-border bg-secondary/30 p-3">
            {photos.slice(1, 5).map((p) => (
              <img key={p.id} src={p.url} alt="" className="h-14 w-14 rounded-md object-cover" />
            ))}
          </div>
        )}
        {(email || phone) && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Contact will be revealed on click: {[email && "email", phone && "phone"].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Upgrade options (dummy) */}
      <div>
        <h3 className="font-display text-lg font-bold">Boost your reach (optional)</h3>
        <p className="text-xs text-muted-foreground">Pick visibility upgrades — charged after publish.</p>
        <div className="mt-3 space-y-2">
          {upgradeOptions.map((u) => {
            const Icon = u.icon;
            const checked = upgrades[u.key];
            return (
              <label
                key={u.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  checked ? "border-brand bg-brand/5" : "border-border hover:border-brand/50"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => setUpgrades({ ...upgrades, [u.key]: Boolean(v) })}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Icon className="h-4 w-4 text-brand" /> {u.label}
                    </span>
                    <span className="text-sm font-bold text-brand">{u.price}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{u.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}