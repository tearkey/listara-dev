import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { getMyAd, updatePendingAd, listFeaturedCities } from "@/lib/ads.functions";
import { BRAND } from "@/lib/brand";

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

          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="inline-flex items-center gap-1 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand" /> Promotion
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Featured and Sticky placements are paid upgrades applied on the
              promote page once your ad is approved — they can't be set here.
              Your current placement is{" "}
              <span className="font-medium text-foreground capitalize">{ad.tier ?? "free"}</span>.
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

export const Route = createFileRoute("/_authenticated/ads/$id/edit")({
  component: EditPendingAd,
  head: () => ({ meta: [{ title: `Edit pending ad — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
