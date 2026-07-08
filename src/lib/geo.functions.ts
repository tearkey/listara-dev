import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getPublicSupabase } from "./supabase-public.server";

type GeoResult =
  | {
      ok: true;
      country: "US";
      city: {
        id: string;
        name: string;
        slug: string;
        stateCode: string;
        stateSlug: string;
      };
    }
  | { ok: false; reason: "non_us" | "unavailable"; country: string | null };

function firstIp(header: string | null): string | null {
  if (!header) return null;
  const ip = header.split(",")[0]?.trim();
  return ip && ip !== "::1" && ip !== "127.0.0.1" ? ip : null;
}

// Detect the visitor's approximate location from request headers / IP.
// Returns the nearest US city we have on file, or a non_us / unavailable signal.
export const detectVisitorCity = createServerFn({ method: "GET" }).handler(
  async (): Promise<GeoResult> => {
    const req = getRequest();
    const headers = req.headers;

    // 1. Cheapest signal: Cloudflare's country header.
    const cfCountry = headers.get("cf-ipcountry");
    if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1" && cfCountry !== "US") {
      return { ok: false, reason: "non_us", country: cfCountry };
    }

    // 2. Get visitor IP.
    const ip =
      headers.get("cf-connecting-ip") ??
      firstIp(headers.get("x-forwarded-for")) ??
      headers.get("x-real-ip");

    let lat: number | null = null;
    let lng: number | null = null;
    let country: string | null = cfCountry ?? null;

    // 3. If Cloudflare gave us a US country but no coords, or we have an IP,
    //    resolve via ip-api.com (free, no key, HTTP-only endpoint works from Workers).
    if (ip) {
      try {
        const res = await fetch(
          `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,lat,lon`,
          { headers: { accept: "application/json" } },
        );
        if (res.ok) {
          const j = (await res.json()) as {
            status?: string;
            countryCode?: string;
            lat?: number;
            lon?: number;
          };
          if (j.status === "success") {
            country = j.countryCode ?? country;
            if (j.countryCode && j.countryCode !== "US") {
              return { ok: false, reason: "non_us", country: j.countryCode };
            }
            if (typeof j.lat === "number" && typeof j.lon === "number") {
              lat = j.lat;
              lng = j.lon;
            }
          }
        }
      } catch {
        // fall through to unavailable
      }
    }

    if (lat == null || lng == null) {
      return { ok: false, reason: "unavailable", country };
    }

    // 4. Find nearest featured city by squared-distance on lat/lng.
    const sb = getPublicSupabase();
    const { data: cities, error } = await sb
      .from("cities")
      .select("id,name,slug,lat,lng,states(code,slug)")
      .eq("is_featured", true)
      .not("lat", "is", null)
      .not("lng", "is", null);
    if (error || !cities || cities.length === 0) {
      return { ok: false, reason: "unavailable", country };
    }

    let best: (typeof cities)[number] | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of cities) {
      const dx = Number(c.lat) - lat;
      const dy = Number(c.lng) - lng;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return { ok: false, reason: "unavailable", country };

    const state = (best as any).states;
    return {
      ok: true,
      country: "US",
      city: {
        id: best.id,
        name: best.name,
        slug: best.slug,
        stateCode: state?.code ?? "",
        stateSlug: state?.slug ?? "",
      },
    };
  },
);
