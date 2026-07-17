import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_call_logs",
  title: "List call logs",
  description: "List recent call logs for the signed-in user's Ringster agents, optionally filtered by agent_id.",
  inputSchema: {
    agent_id: z.string().uuid().optional().describe("Filter to one agent's calls."),
    limit: z.number().int().min(1).max(200).optional().describe("Max calls to return. Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ agent_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("call_logs")
      .select("id, call_sid, agent_id, status, duration, from_number, to_number, start_time, end_time, transfer_count, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (agent_id) query = query.eq("agent_id", agent_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { calls: data ?? [] },
    };
  },
});
