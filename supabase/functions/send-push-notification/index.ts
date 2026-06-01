// Internal helper to send Expo push notifications to a user + their active team members.
// Called from other edge functions (vapi-webhook). Requires EXPO_ACCESS_TOKEN secret.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { owner_user_id, title, body, data } = await req.json();
    if (!owner_user_id) {
      return new Response(JSON.stringify({ error: "Missing owner_user_id" }), { status: 400, headers: jsonHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Collect recipient user IDs: owner + active team members with receives_notifications
    const recipientIds = new Set<string>([owner_user_id]);
    const { data: teammates } = await admin
      .from("team_members")
      .select("member_user_id")
      .eq("owner_user_id", owner_user_id)
      .eq("status", "active")
      .eq("receives_notifications", true);
    for (const t of teammates ?? []) {
      if (t.member_user_id) recipientIds.add(t.member_user_id);
    }

    const { data: devices } = await admin
      .from("push_devices")
      .select("device_token, platform")
      .in("user_id", Array.from(recipientIds));

    const tokens = (devices ?? []).map(d => d.device_token).filter(t => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"));

    if (!EXPO_ACCESS_TOKEN || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: !EXPO_ACCESS_TOKEN ? "no_expo_token" : "no_devices" }), { headers: jsonHeaders });
    }

    const messages = tokens.map(to => ({ to, title, body, data, sound: "default", priority: "high" }));
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    return new Response(JSON.stringify({ ok: true, sent: tokens.length, result }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("send-push-notification error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
