import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, Pin, Star, ArrowUp } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMyAd, updatePendingAd } from "@/lib/ads.functions";
import { listFeaturedCities } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/ads/$id/edit")({
  head: () => ({ meta: [{ title: `Edit pending ad — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: EditPendingAd,
});

const TIERS = [
  { id: "free", label: "Standard", icon: null, desc: "No promotion — appears in normal rotation." },
  { id: "bumped", label: "Bumped", icon: ArrowUp, desc: "Push to the top of the list once." },
  { id: "featured", label: "Featured", icon: Star, desc: "Highlighted in the featured strip." },
  { id: "sticky", label: "Sticky", icon: Pin, desc: "Stays pinned to the top of your category." },
] as const;

function EditPendingAd() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePendingAd);

  const { data: ad } = useSuspenseQuery(
    queryOptions({ queryKey: ["ad-edit", id], queryFn: () => getMyAd({ data: { id } }) }),
  );
  const { data: cities } = useSuspenseQuery(
    queryOptions({ queryKey: ["featured-cities"], queryFn: () => listFeaturedCities() }),
  );

  const [title, setTitle] = useState(ad.title ?? "");
  const [body, setBody] = useState(ad.body ?? "");
  const [cityId, setCityId] = useState<string>(ad.city_id ?? "");
  const [price, setPrice] = useState<string>(
    ad.price_cents != null ? (ad.price_cents / 100).toFixed(2) : "",
  );
  const [email, setEmail] = useState(ad.contact_email ?? "");
  const [phone, setPhone] = useState(ad.contact_phone ?? "");
  const [tier, setTier] = useState<string>(ad.tier ?? "free");
  const [saving, setSaving] = useState(false);

  if (ad.status !== "pending") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">This ad can no longer be edited</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only ads awaiting moderator review can be changed. Current status:
            <span className="ml-1 font-semibold">{ad.status}</span>.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link to="/my-ads">Back to my ads</Link>
            </Button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  async function save() {
    if (title.trim().length < 4 || body.trim().length < 20 || !cityId) {
      toast.error("Title, description, and city are required.");
      return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: {
          id,
          title: title.trim(),
          body: body.trim(),
          city_id: cityId,
          price_cents: price ? Math.round(parseFloat(price) * 100) : null,
          contact_email: email || null,
          contact_phone: phone || null,
          tier: tier as any,
        },
      });
      toast.success("Changes saved — still awaiting moderator review.");
      qc.invalidateQueries({ queryKey: ["my-ads"] });
      qc.invalidateQueries({ queryKey: ["ad-edit", id] });
      navigate({ to: "/my-ads" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/my-ads" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand">
          <ArrowLeft className="h-3 w-3" /> Back to my ads
        </Link>
        <h1 className="font-display text-3xl font-bold">Edit pending ad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the details and promotion before this ad is approved. Once live, use the promote page for changes.
        </p>

        <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>City</Label>
            <Select value={cityId} onValueChange={setCityId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose city" /></SelectTrigger>
              <SelectContent>
                {cities.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}, {c.states.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="price">Price (USD, optional)</Label>
              <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Contact email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="phone">Contact phone (optional)</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="body">Description</Label>
            <Textarea id="body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="inline-flex items-center gap-1"><Sparkles className="h-4 w-4 text-brand" /> Promotion</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {TIERS.map((t) => {
                const Icon = t.icon;
                const active = tier === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTier(t.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${active ? "border-brand bg-brand/5" : "border-border hover:border-brand/50"}`}
                  >
                    <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-brand text-brand-foreground" : "bg-secondary text-brand"}`}>
                      {Icon ? <Icon className="h-4 w-4" /> : "•"}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Paid tiers are billed on the promote page after your ad is approved.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button asChild variant="outline"><Link to="/my-ads">Cancel</Link></Button>
          <Button onClick={save} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
