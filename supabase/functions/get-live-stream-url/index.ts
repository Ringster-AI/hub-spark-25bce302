// Returns a short-lived listen-live URL for a Vapi call.
// Requires auth + can_listen capability (or owner).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const body = await req.json().catch(() => ({}));
    const active_call_id = String(body.active_call_id ?? "");
    if (!active_call_id) {
      return new Response(JSON.stringify({ error: "Missing active_call_id" }), { status: 400, headers: jsonHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: ac } = await admin
      .from("active_calls")
      .select("id, user_id, vapi_call_id, status, stream_url")
      .eq("id", active_call_id)
      .maybeSingle();
    if (!ac) return new Response(JSON.stringify({ error: "Call not found" }), { status: 404, headers: jsonHeaders });
    if (ac.status === "ended") return new Response(JSON.stringify({ error: "Call already ended" }), { status: 409, headers: jsonHeaders });

    // Authorization: owner OR active team member with can_listen
    let allowed = ac.user_id === user.id;
    if (!allowed) {
      const { data: tm } = await admin
        .from("team_members")
        .select("can_listen, status")
        .eq("owner_user_id", ac.user_id)
        .eq("member_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      allowed = !!tm?.can_listen;
    }
    if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });

    if (!VAPI_API_KEY) return new Response(JSON.stringify({ error: "VAPI_API_KEY not configured" }), { status: 500, headers: jsonHeaders });

    // Fetch live call from Vapi to obtain monitor.listenUrl
    const res = await fetch(`https://api.vapi.ai/call/${ac.vapi_call_id}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("vapi get call failed", res.status, data);
      return new Response(JSON.stringify({ error: "Failed to fetch call", details: data }), { status: 502, headers: jsonHeaders });
    }
    const listenUrl: string | null = data?.monitor?.listenUrl ?? null;
    if (!listenUrl) {
      return new Response(JSON.stringify({ error: "Listen URL unavailable for this call" }), { status: 404, headers: jsonHeaders });
    }

    // Cache + return. The URL is already short-lived per Vapi.
    await admin.from("active_calls").update({ stream_url: listenUrl, updated_at: new Date().toISOString() }).eq("id", ac.id);

    return new Response(JSON.stringify({ listen_url: listenUrl, expires_in: 600 }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("get-live-stream-url error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
