import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Sign in to accept this invite" }), { status: 401, headers: jsonHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });
    }
    const token_hash = await sha256(token);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: invite, error: invErr } = await admin
      .from("team_invites")
      .select("*")
      .eq("token_hash", token_hash)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invite) return new Response(JSON.stringify({ error: "Invite not found" }), { status: 404, headers: jsonHeaders });
    if (invite.accepted_at) return new Response(JSON.stringify({ error: "Invite already used" }), { status: 410, headers: jsonHeaders });
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invite expired" }), { status: 410, headers: jsonHeaders });
    }
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Invite is for a different email address" }), { status: 403, headers: jsonHeaders });
    }

    const now = new Date().toISOString();
    await admin.from("team_members")
      .update({ status: "active", member_user_id: user.id, accepted_at: now })
      .eq("id", invite.team_member_id);
    await admin.from("team_invites").update({ accepted_at: now }).eq("id", invite.id);

    return new Response(JSON.stringify({ ok: true, owner_user_id: invite.owner_user_id }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("accept-team-invite error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
