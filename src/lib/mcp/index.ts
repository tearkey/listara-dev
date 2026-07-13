import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchAdsTool from "./tools/search-ads";
import listMyAdsTool from "./tools/list-my-ads";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "classifieds-mcp",
  title: "Classifieds MCP",
  version: "0.1.0",
  instructions:
    "Tools for this classifieds app. Use `whoami` to verify identity, `list_my_ads` to see the signed-in user's listings, and `search_ads` to search public live ads.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyAdsTool, searchAdsTool],
});