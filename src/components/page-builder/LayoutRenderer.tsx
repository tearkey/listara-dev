import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type {
  Column, LayoutDocument, Row, Section, Widget,
} from "@/lib/page-builder.schema";

/**
 * Runtime renderer for a stored layout document.
 * Pure presentational — no data-fetching happens here; data widgets receive
 * pre-resolved data via the `dataSlots` prop, keyed by widget id.
 */
export function LayoutRenderer({
  document,
  cssOverride,
  dataSlots = {},
}: {
  document: LayoutDocument;
  cssOverride?: string | null;
  dataSlots?: Record<string, unknown>;
}) {
  const scopeId = useMemo(() => `pb-${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <div className={scopeId}>
      {cssOverride ? (
        <style>{scopeCss(cssOverride, scopeId)}</style>
      ) : null}
      {document.sections.map((s) => (
        <SectionView key={s.id} node={s} dataSlots={dataSlots} />
      ))}
    </div>
  );
}

/* ------------------------------- nodes -------------------------------- */

function SectionView({ node, dataSlots }: { node: Section; dataSlots: Record<string, unknown> }) {
  return (
    <section style={styleToCss(node.style)} className={extractClass(node)}>
      <div className="mx-auto max-w-7xl px-4">
        {node.rows.map((r) => <RowView key={r.id} node={r} dataSlots={dataSlots} />)}
      </div>
    </section>
  );
}

function RowView({ node, dataSlots }: { node: Row; dataSlots: Record<string, unknown> }) {
  return (
    <div
      className={`grid grid-cols-12 ${extractClass(node)}`}
      style={{ ...styleToCss(node.style), gap: node.gap }}
    >
      {node.columns.map((c) => <ColumnView key={c.id} node={c} dataSlots={dataSlots} />)}
    </div>
  );
}

function ColumnView({ node, dataSlots }: { node: Column; dataSlots: Record<string, unknown> }) {
  // 12-col grid, responsive fallback: stack on mobile, honor width on md+
  const colSpan = `col-span-12 md:col-span-${node.width}`;
  return (
    <div className={`${colSpan} ${extractClass(node)}`} style={styleToCss(node.style)}>
      {node.widgets.map((w) => <WidgetView key={w.id} node={w} dataSlots={dataSlots} />)}
    </div>
  );
}

/* ------------------------------- widgets ------------------------------ */

function WidgetView({ node, dataSlots }: { node: Widget; dataSlots: Record<string, unknown> }) {
  const commonStyle = styleToCss(node.style);
  const commonCls = extractClass(node);

  switch (node.type) {
    case "heading": {
      const Tag = node.props.level as keyof JSX.IntrinsicElements;
      return <Tag className={`font-display font-bold ${commonCls}`} style={commonStyle}>{node.props.text}</Tag>;
    }
    case "text":
      return (
        <div
          className={`prose prose-sm max-w-none dark:prose-invert ${commonCls}`}
          style={commonStyle}
          // Markdown is treated as plain text here; wire in a markdown renderer
          // (e.g. react-markdown) when you install one.
        >
          {node.props.markdown}
        </div>
      );
    case "image": {
      const img = (
        <img
          src={node.props.src}
          alt={node.props.alt}
          loading="lazy"
          className={`h-auto w-full rounded-md ${commonCls}`}
          style={commonStyle}
        />
      );
      return node.props.href ? <a href={node.props.href}>{img}</a> : img;
    }
    case "button": {
      const variantCls =
        node.props.variant === "primary" ? "bg-brand text-brand-foreground"
        : node.props.variant === "secondary" ? "bg-secondary text-foreground"
        : "bg-transparent text-foreground border border-border";
      return (
        <a href={node.props.href}
           className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${variantCls} ${commonCls}`}
           style={commonStyle}>
          {node.props.label}
        </a>
      );
    }
    case "spacer":
      return <div style={{ ...commonStyle, height: node.props.height }} className={commonCls} />;
    case "recent_ads": {
      const rows = (dataSlots[node.id] as Array<{ id: string; slug: string; title: string; price_cents: number | null }>) ?? [];
      const gridCls = node.props.layout === "grid" ? "grid grid-cols-2 gap-3 md:grid-cols-3" : "flex flex-col gap-2";
      return (
        <div className={`${gridCls} ${commonCls}`} style={commonStyle}>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ads yet.</p>
          ) : rows.map((r) => (
            <Link key={r.id} to="/" className="rounded-md border border-border bg-card p-3 text-sm hover:border-brand">
              <div className="font-medium">{r.title}</div>
              {r.price_cents != null && <div className="text-brand">${(r.price_cents / 100).toFixed(2)}</div>}
            </Link>
          ))}
        </div>
      );
    }
    case "blog_feed": {
      const posts = (dataSlots[node.id] as Array<{ id: string; slug: string; title: string; excerpt: string | null }>) ?? [];
      return (
        <div className={`space-y-3 ${commonCls}`} style={commonStyle}>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : posts.map((p) => (
            <article key={p.id} className="rounded-md border border-border bg-card p-3">
              <h3 className="font-display text-base font-semibold">{p.title}</h3>
              {node.props.show_excerpt && p.excerpt && (
                <p className="mt-1 text-sm text-muted-foreground">{p.excerpt}</p>
              )}
            </article>
          ))}
        </div>
      );
    }
  }
}

/* ------------------------------ helpers ------------------------------- */

function extractClass(node: { style?: { className?: string } }) {
  return node.style?.className ?? "";
}

function styleToCss(style?: {
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  margin?:  { top?: number; right?: number; bottom?: number; left?: number };
  align?: string;
  background?: string; text_color?: string; min_height?: number; radius?: number;
}): React.CSSProperties {
  if (!style) return {};
  const s: React.CSSProperties = {};
  if (style.padding) s.padding = spacingTuple(style.padding);
  if (style.margin)  s.margin  = spacingTuple(style.margin);
  if (style.align === "center") s.textAlign = "center";
  if (style.align === "right")  s.textAlign = "right";
  if (style.background)  s.background = style.background;
  if (style.text_color)  s.color = style.text_color;
  if (style.min_height)  s.minHeight = style.min_height;
  if (style.radius != null) s.borderRadius = style.radius;
  return s;
}

function spacingTuple(v: { top?: number; right?: number; bottom?: number; left?: number }) {
  const t = v.top ?? 0, r = v.right ?? 0, b = v.bottom ?? 0, l = v.left ?? 0;
  return `${t}px ${r}px ${b}px ${l}px`;
}

/** Naively scope raw CSS by prefixing each selector with our scope id. */
function scopeCss(css: string, scopeId: string) {
  return css.replace(/(^|\})\s*([^{}@]+)\{/g, (_m, brace, sel) => {
    const scoped = sel
      .split(",")
      .map((s: string) => `.${scopeId} ${s.trim()}`)
      .join(", ");
    return `${brace} ${scoped} {`;
  });
}