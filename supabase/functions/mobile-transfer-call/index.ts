// Auth-required: transfers an in-progress Vapi call from the mobile app.
// Verifies caller is owner OR active team member with can_transfer=true.
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
    const destination = String(body.destination ?? ""); // E.164 phone
    if (!active_call_id || !/^\+[1-9]\d{6,14}$/.test(destination)) {
      return new Response(JSON.stringify({ error: "Invalid input. Expect active_call_id and E.164 destination." }), { status: 400, headers: jsonHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: ac, error: acErr } = await admin
      .from("active_calls")
      .select("id, user_id, vapi_call_id, status")
      .eq("id", active_call_id)
      .maybeSingle();
    if (acErr) throw acErr;
    if (!ac) return new Response(JSON.stringify({ error: "Call not found" }), { status: 404, headers: jsonHeaders });
    if (ac.status === "ended") return new Response(JSON.stringify({ error: "Call already ended" }), { status: 409, headers: jsonHeaders });

    // Authorization: owner OR active team member with can_transfer
    let allowed = ac.user_id === user.id;
    if (!allowed) {
      const { data: tm } = await admin
        .from("team_members")
        .select("can_transfer, status")
        .eq("owner_user_id", ac.user_id)
        .eq("member_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      allowed = !!tm?.can_transfer;
    }
    if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });

    if (!VAPI_API_KEY) return new Response(JSON.stringify({ error: "VAPI_API_KEY not configured" }), { status: 500, headers: jsonHeaders });

    // Vapi call control: transfer
    const res = await fetch(`https://api.vapi.ai/call/${ac.vapi_call_id}/control`, {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "transfer", destination: { type: "number", number: destination } }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("vapi transfer failed", res.status, result);
      return new Response(JSON.stringify({ error: "Vapi transfer failed", details: result }), { status: 502, headers: jsonHeaders });
    }

    await admin.from("active_calls").update({ status: "transferring", updated_at: new Date().toISOString() }).eq("id", ac.id);
    await admin.from("call_events").insert({
      active_call_id: ac.id,
      event_type: "transfer-requested",
      payload: { by_user_id: user.id, destination },
    });

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("mobile-transfer-call error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
