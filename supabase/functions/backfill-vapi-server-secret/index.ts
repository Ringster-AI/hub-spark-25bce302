import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const VAPI_SERVER_MESSAGES = ["status-update", "transcript", "end-of-call-report"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const vapiApiKey = Deno.env.get("VAPI_API_KEY");
    const vapiServerSecret = Deno.env.get("VAPI_SERVER_SECRET");

    if (!vapiApiKey) {
      return new Response(JSON.stringify({ error: "VAPI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!vapiServerSecret) {
      return new Response(JSON.stringify({ error: "VAPI_SERVER_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: dry run + scope to one agent
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const dryRun: boolean = body?.dryRun === true;
    const onlyAgentId: string | undefined = body?.agentId;

    let query = admin
      .from("agent_configs")
      .select("id, name, vapi_assistant_id, user_id")
      .not("vapi_assistant_id", "is", null);
    if (onlyAgentId) query = query.eq("id", onlyAgentId);

    const { data: agents, error: agentsError } = await query;
    if (agentsError) throw new Error(`Failed to list agents: ${agentsError.message}`);

    const webhookUrl = `${supabaseUrl}/functions/v1/vapi-webhook`;
    const results: Array<{
      agentId: string;
      vapiAssistantId: string;
      status: "ok" | "skipped" | "error";
      message?: string;
    }> = [];

    for (const a of agents || []) {
      const assistantId = a.vapi_assistant_id as string;
      try {
        if (dryRun) {
          results.push({ agentId: a.id, vapiAssistantId: assistantId, status: "skipped", message: "dry run" });
          continue;
        }

        const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${vapiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            server: { url: webhookUrl, secret: vapiServerSecret },
            serverMessages: VAPI_SERVER_MESSAGES,
          }),
        });

        if (!patchRes.ok) {
          const txt = await patchRes.text();
          results.push({
            agentId: a.id,
            vapiAssistantId: assistantId,
            status: "error",
            message: `${patchRes.status}: ${txt.slice(0, 200)}`,
          });
          continue;
        }

        results.push({ agentId: a.id, vapiAssistantId: assistantId, status: "ok" });
      } catch (err) {
        results.push({
          agentId: a.id,
          vapiAssistantId: assistantId,
          status: "error",
          message: (err as Error).message,
        });
      }
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      errors: results.filter((r) => r.status === "error").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    };

    return new Response(JSON.stringify({ success: true, summary, results, dryRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("backfill-vapi-server-secret error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
