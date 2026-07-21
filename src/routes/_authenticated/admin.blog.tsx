import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, ArrowLeft, Save, Trash2, Eye, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminListPosts,
  adminGetPost,
  adminUpsertPost,
  adminDeletePost,
} from "@/modules/blog/blog.functions";
import { Markdown } from "@/lib/markdown";
import { BRAND } from "@/lib/brand";

const listOpts = queryOptions({
  queryKey: ["admin", "blog", "list"],
  queryFn: () => adminListPosts(),
});

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-100 text-green-900 hover:bg-green-100",
  draft: "bg-yellow-100 text-yellow-900 hover:bg-yellow-100",
  archived: "bg-secondary text-secondary-foreground",
};

type Draft = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body_markdown: string;
  cover_image: string;
  status: "draft" | "published" | "archived";
  seo_title: string;
  meta_description: string;
  og_image: string;
  canonical_url: string;
  focus_keywords: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  slug: "",
  excerpt: "",
  body_markdown: "",
  cover_image: "",
  status: "draft",
  seo_title: "",
  meta_description: "",
  og_image: "",
  canonical_url: "",
  focus_keywords: "",
};

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {label}
    </li>
  );
}

// RankMath-style pre-publish checklist, computed client-side.
function SeoChecklist({ d }: { d: Draft }) {
  const kw = d.focus_keywords.split(",")[0]?.trim().toLowerCase() ?? "";
  const effTitle = (d.seo_title || d.title).toLowerCase();
  const effDesc = (d.meta_description || d.excerpt).toLowerCase();
  const first100 = d.body_markdown.slice(0, 600).toLowerCase();
  const checks = [
    { ok: Boolean(kw), label: "Focus keyword set" },
    { ok: Boolean(kw) && effTitle.includes(kw), label: "Keyword in SEO title" },
    { ok: Boolean(kw) && effDesc.includes(kw), label: "Keyword in meta description" },
    { ok: Boolean(kw) && first100.includes(kw), label: "Keyword early in the content" },
    { ok: effTitle.length > 0 && effTitle.length <= 60, label: "SEO title ≤ 60 characters" },
    {
      ok: effDesc.length >= 50 && effDesc.length <= 155,
      label: "Meta description 50–155 characters",
    },
    { ok: d.body_markdown.trim().length >= 1500, label: "Content 300+ words" },
    { ok: Boolean(d.cover_image || d.og_image), label: "Has a cover / social image" },
  ];
  const score = checks.filter((c) => c.ok).length;
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">SEO checklist</div>
        <Badge variant="outline">{score}/{checks.length}</Badge>
      </div>
      <ul className="mt-3 space-y-1.5">
        {checks.map((c) => (
          <CheckItem key={c.label} ok={c.ok} label={c.label} />
        ))}
      </ul>
    </div>
  );
}

function PostEditor({ postId, onBack }: { postId: string | null; onBack: () => void }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertPost);
  const deleteFn = useServerFn(adminDeletePost);
  const getFn = useServerFn(adminGetPost);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin", "blog", "post", postId],
    queryFn: () => getFn({ data: { id: postId! } }),
    enabled: Boolean(postId),
  });

  const [d, setD] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing) {
      setD({
        id: existing.id,
        title: existing.title ?? "",
        slug: existing.slug ?? "",
        excerpt: existing.excerpt ?? "",
        body_markdown: existing.body_markdown ?? "",
        cover_image: existing.cover_image ?? "",
        status: (existing.status as Draft["status"]) ?? "draft",
        seo_title: existing.seo_title ?? "",
        meta_description: existing.meta_description ?? "",
        og_image: existing.og_image ?? "",
        canonical_url: existing.canonical_url ?? "",
        focus_keywords: (existing.focus_keywords ?? []).join(", "),
      });
    }
  }, [existing]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  async function save(status?: Draft["status"]) {
    if (d.title.trim().length < 3) return toast.error("Title required (3+ characters).");
    setBusy(true);
    try {
      const res = await upsertFn({
        data: {
          id: d.id,
          title: d.title,
          slug: d.slug || undefined,
          excerpt: d.excerpt || null,
          body_markdown: d.body_markdown,
          cover_image: d.cover_image || "",
          status: status ?? d.status,
          seo_title: d.seo_title || null,
          meta_description: d.meta_description || null,
          og_image: d.og_image || "",
          canonical_url: d.canonical_url || "",
          focus_keywords: d.focus_keywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 10),
        },
      });
      set({ id: res.id, status: res.status as Draft["status"], slug: res.slug });
      toast.success(res.status === "published" ? "Published!" : "Saved.");
      await qc.invalidateQueries({ queryKey: ["admin", "blog"] });
      await qc.invalidateQueries({ queryKey: ["blog"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!d.id) return;
    if (!confirm("Delete this post permanently?")) return;
    setBusy(true);
    try {
      await deleteFn({ data: { id: d.id } });
      toast.success("Post deleted");
      await qc.invalidateQueries({ queryKey: ["admin", "blog"] });
      onBack();
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  if (postId && isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading post…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand">
          <ArrowLeft className="h-4 w-4" /> All posts
        </button>
        <div className="flex items-center gap-2">
          {d.status === "published" && d.slug && (
            <Button asChild size="sm" variant="ghost">
              <a href={`/blog/${d.slug}`} target="_blank" rel="noreferrer">
                <Eye className="mr-1.5 h-4 w-4" /> View
              </a>
            </Button>
          )}
          {d.id && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => save("draft")}>
            <Save className="mr-1.5 h-4 w-4" /> Save draft
          </Button>
          <Button
            size="sm"
            disabled={busy}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => save("published")}
          >
            {d.status === "published" ? "Update" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Main editor */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" maxLength={160} value={d.title} onChange={(e) => set({ title: e.target.value })} className="mt-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input id="slug" value={d.slug} placeholder="auto-generated from title" onChange={(e) => set({ slug: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cover">Cover image URL</Label>
              <Input id="cover" value={d.cover_image} onChange={(e) => set({ cover_image: e.target.value })} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea id="excerpt" rows={2} maxLength={500} value={d.excerpt} onChange={(e) => set({ excerpt: e.target.value })} className="mt-1" />
          </div>

          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Textarea
                rows={20}
                value={d.body_markdown}
                onChange={(e) => set({ body_markdown: e.target.value })}
                placeholder={"# Heading\n\nWrite in **markdown** — headings, lists, links, images, quotes, and code blocks are supported."}
                className="mt-1 font-mono text-sm"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="mt-1 min-h-[300px] rounded-xl border border-border p-5">
                {d.body_markdown.trim() ? (
                  <Markdown source={d.body_markdown} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* SEO sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold">SEO</div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="seo-title">SEO title</Label>
                <span className={`text-[11px] ${(d.seo_title || d.title).length > 60 ? "text-destructive" : "text-muted-foreground"}`}>
                  {(d.seo_title || d.title).length}/60
                </span>
              </div>
              <Input id="seo-title" maxLength={120} value={d.seo_title} placeholder={d.title || "Defaults to the post title"} onChange={(e) => set({ seo_title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="meta-desc">Meta description</Label>
                <span className={`text-[11px] ${(d.meta_description || d.excerpt).length > 155 ? "text-destructive" : "text-muted-foreground"}`}>
                  {(d.meta_description || d.excerpt).length}/155
                </span>
              </div>
              <Textarea id="meta-desc" rows={3} maxLength={300} value={d.meta_description} placeholder={d.excerpt || "Defaults to the excerpt"} onChange={(e) => set({ meta_description: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="focus-kw">Focus keywords (comma-separated)</Label>
              <Input id="focus-kw" value={d.focus_keywords} placeholder="rental scams, apartment safety" onChange={(e) => set({ focus_keywords: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="og-image">Social image URL</Label>
              <Input id="og-image" value={d.og_image} placeholder="Defaults to cover image" onChange={(e) => set({ og_image: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="canonical">Canonical URL</Label>
              <Input id="canonical" value={d.canonical_url} placeholder="Only for republished content" onChange={(e) => set({ canonical_url: e.target.value })} className="mt-1" />
            </div>
          </div>

          <SeoChecklist d={d} />

          {/* Search preview */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm font-semibold">Search preview</div>
            <div className="mt-2 rounded-lg border border-border p-3">
              <div className="line-clamp-1 text-sm font-medium text-blue-700 dark:text-blue-400">
                {(d.seo_title || d.title || "Post title")} | {BRAND.name}
              </div>
              <div className="mt-0.5 text-xs text-green-700 dark:text-green-500">
                {BRAND.domain ?? "example.com"}/blog/{d.slug || "post-slug"}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {d.meta_description || d.excerpt || "Meta description preview appears here."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlogAdminPage() {
  const { data: posts } = useSuspenseQuery(listOpts);
  const [editing, setEditing] = useState<string | null | "new">(null);

  const sorted = useMemo(
    () => [...posts].sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [posts],
  );

  if (editing !== null) {
    return <PostEditor postId={editing === "new" ? null : editing} onBack={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand" />
          <h1 className="font-display text-2xl font-bold">Blog</h1>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="mr-1.5 h-4 w-4" /> New post
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No posts yet. Write your first safety guide — it's the engine of the trust strategy.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setEditing(p.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-brand/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{p.title}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  /blog/{p.slug}
                  {p.published_at &&
                    ` · ${new Date(p.published_at).toLocaleDateString()}`}
                </div>
              </div>
              <Badge className={STATUS_BADGE[p.status] ?? ""}>{p.status}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/blog")({
  component: BlogAdminPage,
  head: () => ({ meta: [{ title: `Blog — Admin — ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
});
