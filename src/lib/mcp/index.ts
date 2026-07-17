import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAgentsTool from "./tools/list-agents";
import getAgentTool from "./tools/get-agent";
import listCallLogsTool from "./tools/list-call-logs";

// Direct Supabase host is required for the OAuth issuer (mcp-js validates
// the discovery document against this exact URL). Build it from the project
// ref env literal Vite inlines at build time — do NOT read SUPABASE_URL.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ringster-mcp",
  title: "Ringster",
  version: "0.1.0",
  instructions:
    "Tools for Ringster, an AI voice receptionist platform. Use `list_agents` to see the user's AI agents, `get_agent` for one agent's full configuration, and `list_call_logs` to inspect recent calls.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAgentsTool, getAgentTool, listCallLogsTool],
});
