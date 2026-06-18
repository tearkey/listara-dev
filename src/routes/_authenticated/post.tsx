import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCategories, listFeaturedCities, listStates } from "@/lib/catalog.functions";
import { createAd } from "@/lib/ads.functions";
import { useServerFn } from "@tanstack/react-start";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/post")({
  head: () => ({ meta: [{ title: `Post a free ad — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: PostPage,
});

function PostPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createAd);
  const { data: categories } = useSuspenseQuery(queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() }));
  const { data: cities } = useSuspenseQuery(queryOptions({ queryKey: ["featured-cities"], queryFn: () => listFeaturedCities() }));
  const { data: _states } = useSuspenseQuery(queryOptions({ queryKey: ["states"], queryFn: () => listStates() }));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const subcats = useMemo(() => {
    return categories.find((c: any) => c.id === categoryId)?.subcategories ?? [];
  }, [categoryId, categories]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityId || !categoryId || title.length < 4 || body.length < 20) {
      toast.error("Please fill in title, description, city, and category.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createFn({
        data: {
          title, body, city_id: cityId, category_id: categoryId,
          subcategory_id: subcategoryId || undefined,
          price_cents: price ? Math.round(parseFloat(price) * 100) : undefined,
          contact_email: email || undefined,
          contact_phone: phone || undefined,
        },
      });
      if (result.status === "rejected") {
        toast.error("Your ad was blocked by our policy filter. Please revise and try again.");
        setSubmitting(false);
        return;
      }
      if (result.status === "pending") {
        toast.success("Posted — pending moderator review.");
      } else {
        toast.success("Live! Your ad is now visible.");
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Post a free ad</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reach neighbors in your city. Be honest, be specific, get a faster response.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. IKEA Malm desk, like new" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>City</Label>
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
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(""); }}>
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

          <div>
            <Label htmlFor="body">Description</Label>
            <Textarea id="body" required minLength={20} maxLength={8000} rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Honest details, condition, what's included, where to meet…" className="mt-1" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="price">Price (USD, optional)</Label>
              <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="email">Contact email (optional)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="phone">Contact phone (optional)</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>

          <div className="rounded-xl bg-secondary/60 p-4 text-xs text-muted-foreground">
            By posting, you agree to our community rules: no prostitution/escort ads, no weapons sales to civilians, no controlled substances, no counterfeits, no harassment. Violations are removed and accounts banned.
          </div>

          <Button type="submit" disabled={submitting} className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90">
            {submitting ? "Posting…" : "Post my free ad"}
          </Button>
        </form>
      </div>
      <SiteFooter />
    </div>
  );
}