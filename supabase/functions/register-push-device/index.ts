import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VALID_PLATFORMS = ["ios", "android", "expo", "web"];

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
    const device_token = String(body.device_token ?? "");
    const platform = String(body.platform ?? "");
    const app_version = body.app_version ? String(body.app_version) : null;
    if (!device_token || !VALID_PLATFORMS.includes(platform)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers: jsonHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Enforce device limit per plan
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("plan:subscription_plans(max_mobile_devices)")
      .eq("user_id", user.id)
      .maybeSingle();
    const devicesLimit = (sub?.plan as any)?.max_mobile_devices ?? 1;
    const { count } = await admin
      .from("push_devices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    const { data: existing } = await admin
      .from("push_devices")
      .select("id")
      .eq("device_token", device_token)
      .maybeSingle();
    if (!existing && (count ?? 0) >= devicesLimit) {
      return new Response(JSON.stringify({ error: "Device limit reached for your plan" }), { status: 403, headers: jsonHeaders });
    }

    const { error } = await admin.from("push_devices").upsert({
      user_id: user.id,
      device_token,
      platform,
      app_version,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "device_token" });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("register-push-device error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
