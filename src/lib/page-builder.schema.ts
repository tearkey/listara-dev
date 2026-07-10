import { z } from "zod";

/**
 * Elementor-style layout document.
 * Hierarchy: Document → Sections → Rows → Columns → Widgets.
 * All styling lives on the node under `.style` and `.responsive.{sm,md,lg}`.
 */

const spacing = z.object({
  top: z.number().min(0).max(500).optional(),
  right: z.number().min(0).max(500).optional(),
  bottom: z.number().min(0).max(500).optional(),
  left: z.number().min(0).max(500).optional(),
}).partial();

const styleBlock = z.object({
  padding: spacing.optional(),
  margin: spacing.optional(),
  align: z.enum(["left", "center", "right", "stretch"]).optional(),
  background: z.string().max(200).optional(),        // CSS color or url()
  text_color: z.string().max(80).optional(),
  min_height: z.number().min(0).max(2000).optional(),
  radius: z.number().min(0).max(64).optional(),
  className: z.string().max(200).optional(),
}).partial();

const responsive = z.object({
  sm: styleBlock.optional(),
  md: styleBlock.optional(),
  lg: styleBlock.optional(),
}).partial();

/** Widgets: the leaf components the renderer knows how to draw. */
export const WidgetSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(), type: z.literal("heading"),
    props: z.object({
      text: z.string().max(300),
      level: z.enum(["h1", "h2", "h3", "h4"]).default("h2"),
    }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("text"),
    props: z.object({ markdown: z.string().max(20000) }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("image"),
    props: z.object({
      src: z.string().url().max(2000),
      alt: z.string().max(300).default(""),
      href: z.string().max(2000).optional(),
    }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("button"),
    props: z.object({
      label: z.string().max(80),
      href: z.string().max(2000),
      variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
    }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("recent_ads"),
    props: z.object({
      city_slug: z.string().max(120).optional(),
      category_slug: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(24).default(6),
      layout: z.enum(["grid", "list"]).default("grid"),
    }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("blog_feed"),
    props: z.object({
      limit: z.number().int().min(1).max(12).default(3),
      show_excerpt: z.boolean().default(true),
    }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
  z.object({
    id: z.string(), type: z.literal("spacer"),
    props: z.object({ height: z.number().min(1).max(400).default(24) }),
    style: styleBlock.optional(), responsive: responsive.optional(),
  }),
]);
export type Widget = z.infer<typeof WidgetSchema>;

export const ColumnSchema = z.object({
  id: z.string(),
  width: z.number().min(1).max(12).default(12),   // 12-col grid
  widgets: z.array(WidgetSchema).default([]),
  style: styleBlock.optional(),
  responsive: responsive.optional(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const RowSchema = z.object({
  id: z.string(),
  gap: z.number().min(0).max(64).default(16),
  columns: z.array(ColumnSchema).min(1).max(6),
  style: styleBlock.optional(),
  responsive: responsive.optional(),
});
export type Row = z.infer<typeof RowSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  name: z.string().max(80).optional(),
  rows: z.array(RowSchema).min(1),
  style: styleBlock.optional(),
  responsive: responsive.optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const LayoutDocumentSchema = z.object({
  version: z.literal(1).default(1),
  sections: z.array(SectionSchema).min(1),
});
export type LayoutDocument = z.infer<typeof LayoutDocumentSchema>;