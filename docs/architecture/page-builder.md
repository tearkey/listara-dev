# Visual Page Editor & Theme Builder

> Elementor-style layout engine backed by JSONB in Postgres, validated by Zod, and rendered by a pure React component. Ships in the same Worker bundle as the app — no runtime code eval.

## 1. Data model

Three tables (see the migration in `supabase/migrations/`):

| Table            | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `page_layouts`   | Stored layout documents (`document JSONB`, versioned, active flag)      |
| `page_templates` | Assigns a layout to a `post_type` + optional `scope_key`                |
| `site_settings`  | KV store for General / Permalinks / SEO / Integrations / System         |

`page_templates.post_type` values in use: `home`, `blog_single`, `blog_archive`, `ad_single`, `ad_archive`, `custom`. `scope_key` narrows the template (e.g. `scope_key = 'jobs'` on `ad_archive` for the Jobs category).

## 2. JSON schema

Schema lives in `src/lib/page-builder.schema.ts` and is enforced at write-time by `saveLayout()`.

```
LayoutDocument
└─ sections[]        ← full-bleed strips of page
   ├─ style / responsive
   └─ rows[]         ← a horizontal band, 12-col grid
      ├─ gap
      ├─ style / responsive
      └─ columns[]   ← 1–6 per row, width in 12-col units
         ├─ width
         ├─ style / responsive
         └─ widgets[]  ← the actual UI
```

`style` (any node) supports: `padding`, `margin`, `align`, `background`, `text_color`, `min_height`, `radius`, `className`. `responsive: { sm, md, lg }` overrides the base `style` per breakpoint.

### Widget catalog (initial)

| `type`        | Props                                                    | Data slot? |
| ------------- | -------------------------------------------------------- | ---------- |
| `heading`     | `text`, `level` (h1–h4)                                  | no         |
| `text`        | `markdown`                                               | no         |
| `image`       | `src`, `alt`, optional `href`                            | no         |
| `button`      | `label`, `href`, `variant`                               | no         |
| `spacer`      | `height` px                                              | no         |
| `recent_ads`  | `city_slug?`, `category_slug?`, `limit`, `layout`        | **yes**    |
| `blog_feed`   | `limit`, `show_excerpt`                                  | **yes**    |

Adding a widget = one new branch in `WidgetSchema` + one new `case` in the renderer.

### Example document

```json
{
  "version": 1,
  "sections": [
    { "id": "sec-1",
      "style": { "padding": { "top": 48, "bottom": 32 }, "background": "hsl(var(--secondary))" },
      "rows": [
        { "id": "r-1", "gap": 24, "columns": [
          { "id": "c-1", "width": 7, "widgets": [
            { "id": "w-h", "type": "heading", "props": { "text": "Post something", "level": "h1" } },
            { "id": "w-p", "type": "text", "props": { "markdown": "Reach buyers in your city." } },
            { "id": "w-b", "type": "button", "props": { "label": "Post now", "href": "/post", "variant": "primary" } }
          ]},
          { "id": "c-2", "width": 5, "widgets": [
            { "id": "w-ads", "type": "recent_ads", "props": { "limit": 6, "layout": "grid" } }
          ]}
        ]}
      ]}
  ]
}
```

## 3. Rendering engine

`src/components/page-builder/LayoutRenderer.tsx` is a pure component: it walks the tree and emits Tailwind-based markup. It never fetches data — data widgets receive pre-resolved rows via the `dataSlots` prop keyed by widget id. Callers (route loaders) fan out the queries.

```tsx
const layout = await getTemplateFor({ data: { post_type: 'home' } });
const recent = await getRecentAds({ data: { limit: 6 } });
const posts  = await getRecentPosts({ data: { limit: 3 } });
return (
  <LayoutRenderer
    document={layout.document}
    cssOverride={layout.css_override}
    dataSlots={{ 'w-ads': recent, 'w-posts': posts }}
  />
);
```

`css_override` is naively scope-prefixed with a per-render class, so authors can add small custom rules without leaking styles.

## 4. Template system

Admins save a layout with `saveLayout()`, then assign it with `assignTemplate({ post_type, scope_key?, layout_id })`. The public `getTemplateFor()` resolves scoped-first, then default. Route loaders on `/`, `/ads/:slug`, `/blog/:slug` etc. call `getTemplateFor()` and hand the document to `LayoutRenderer`.

A rebuild is not required — layouts are pure data.

## 5. Security model

- Layout writes go through `saveLayout()` which validates the full tree with Zod. No arbitrary keys survive.
- `LayoutRenderer` never uses `dangerouslySetInnerHTML`. Text and markdown render as text; wire in a sanitized markdown renderer when needed.
- `css_override` is inlined into a `<style>` block but only inside the scoped class — no `@import`, no external URLs allowed (add a stricter regex if hosting untrusted authors).
- Storage-backed widgets (upcoming SVG uploads) will pass every SVG through a server-side sanitizer before writing to the bucket.

## 6. Deferred (not shipped, documented)

| Item                                    | Why                                             | Path forward                                                                    |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Cloudflare cache purge from admin       | Needs a credential                              | Add Cloudflare via `standard_connectors--connect`; wire a purge server fn.       |
| SVG upload sanitization                 | No storage bucket exists yet                    | Create a bucket, run every upload through DOMPurify (`{ USE_PROFILES: { svg: true, svgFilters: true } }`) on a server fn before writing. |
| Full SQL dump/restore                   | Unsafe on managed Postgres                      | Use `admin_export_snapshot` for config; Cloud → Advanced → Export data for full-table backups. |
| Node/PHP memory-limit checks            | N/A on Cloudflare Workers                       | `getSiteHealth()` returns DB ping ms + Postgres version + counts instead.       |
| Visual drag-and-drop editor UI          | Large scope; renderer + schema come first       | Build a separate `/admin/layouts/$id/edit` route using the schema as the source of truth. |