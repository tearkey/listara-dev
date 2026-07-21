import { getPublicSupabase } from "@/lib/supabase-public.server";

// Activation snapshot with a short TTL: an admin toggle in /admin/modules is
// visible to every request within TTL_MS without a redeploy, while steady-state
// traffic costs one modules query per window instead of one per request.
const TTL_MS = 10_000;

let cache: { slugs: Set<string>; at: number } | null = null;

export async function getActiveModuleSlugs(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.slugs;
  const sb = getPublicSupabase();
  const { data, error } = await (sb as any)
    .from("modules")
    .select("slug")
    .eq("is_active", true);
  if (error) {
    // A missing modules table (migration not yet applied) must not take the
    // whole site down — treat it as "no modules active".
    console.error("modules snapshot failed:", error.message);
    return cache?.slugs ?? new Set();
  }
  cache = { slugs: new Set((data ?? []).map((r: any) => r.slug as string)), at: Date.now() };
  return cache.slugs;
}

export async function isModuleActive(slug: string): Promise<boolean> {
  return (await getActiveModuleSlugs()).has(slug);
}

/** Called after an admin flips activation so the same instance sees it immediately. */
export function invalidateModuleSnapshot() {
  cache = null;
}
