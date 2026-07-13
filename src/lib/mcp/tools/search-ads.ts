import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supabaseForUser(token: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_ads",
  title: "Search live ads",
  description: "Search public live classifieds by keyword. Returns id, title, slug, and city.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Keyword to search ad titles."),
    limit: z.number().int().min(1).max(50).default(20).describe("Max results (1–50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx.getToken()!);
    const { data, error } = await sb
      .from("ads")
      .select("id,short_id,slug,title,price_cents,posted_at,cities(name,states(code))")
      .eq("status", "live")
      .ilike("title", `%${query}%`)
      .order("posted_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { ads: data ?? [] },
    };
  },
});