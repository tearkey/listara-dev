// Per-category structured ad attributes, stored in ads.attrs (JSONB).
// Config lives in code until a second complex category justifies moving it to
// the database. Keys must stay stable — they are the JSONB keys.

export type AttrField =
  | { key: string; label: string; type: "number"; min?: number; max?: number; suffix?: string }
  | { key: string; label: string; type: "select"; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: "boolean" };

export const CATEGORY_ATTRS: Record<string, AttrField[]> = {
  housing: [
    { key: "bedrooms", label: "Bedrooms", type: "number", min: 0, max: 20 },
    { key: "bathrooms", label: "Bathrooms", type: "number", min: 0, max: 20 },
    { key: "sqft", label: "Size", type: "number", min: 0, max: 100_000, suffix: "sqft" },
    {
      key: "rent_period",
      label: "Rent period",
      type: "select",
      options: [
        { value: "month", label: "Per month" },
        { value: "week", label: "Per week" },
        { value: "night", label: "Per night" },
        { value: "sale", label: "For sale" },
      ],
    },
    { key: "pets_ok", label: "Pets allowed", type: "boolean" },
  ],
};

export function attrsForCategory(slug: string | undefined | null): AttrField[] {
  return (slug && CATEGORY_ATTRS[slug]) || [];
}

/** Human-readable chips for an ad detail page, in config order. */
export function formatAttrs(
  categorySlug: string | undefined | null,
  attrs: Record<string, unknown> | null | undefined,
): Array<{ label: string; value: string }> {
  if (!attrs) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const f of attrsForCategory(categorySlug)) {
    const v = attrs[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "boolean") {
      out.push({ label: f.label, value: v ? "Yes" : "No" });
    } else if (f.type === "select") {
      const opt = f.options.find((o) => o.value === v);
      out.push({ label: f.label, value: opt?.label ?? String(v) });
    } else {
      out.push({ label: f.label, value: `${v}${"suffix" in f && f.suffix ? ` ${f.suffix}` : ""}` });
    }
  }
  return out;
}
