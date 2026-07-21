import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attrsForCategory } from "@/lib/category-attrs";

export type AttrValues = Record<string, string | number | boolean>;

// Structured fields for categories that define them (see category-attrs.ts).
// Renders nothing for categories without a config.
export function CategoryAttrFields({
  categorySlug,
  values,
  onChange,
}: {
  categorySlug: string | undefined | null;
  values: AttrValues;
  onChange: (next: AttrValues) => void;
}) {
  const fields = attrsForCategory(categorySlug);
  if (fields.length === 0) return null;

  function set(key: string, value: string | number | boolean | undefined) {
    const next = { ...values };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 text-sm font-semibold">Details</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.type === "boolean") {
            return (
              <label key={f.key} className="flex items-center gap-2 pt-5">
                <Switch
                  checked={Boolean(values[f.key])}
                  onCheckedChange={(v) => set(f.key, v)}
                />
                <span className="text-sm">{f.label}</span>
              </label>
            );
          }
          if (f.type === "select") {
            return (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Select
                  value={(values[f.key] as string) ?? ""}
                  onValueChange={(v) => set(f.key, v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={f.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }
          return (
            <div key={f.key}>
              <Label htmlFor={`attr-${f.key}`}>
                {f.label}
                {f.suffix ? ` (${f.suffix})` : ""}
              </Label>
              <Input
                id={`attr-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                value={values[f.key] === undefined ? "" : String(values[f.key])}
                onChange={(e) =>
                  set(f.key, e.target.value === "" ? undefined : Number(e.target.value))
                }
                className="mt-1"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
