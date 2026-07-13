import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "list_my_ads",
  title: "List my ads",
  description: "List all ads owned by the signed-in user, across every status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("ads")
      .select("id,short_id,slug,title,status,tier,posted_at,expires_at,view_count")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { ads: data ?? [] },
    };
  },
});