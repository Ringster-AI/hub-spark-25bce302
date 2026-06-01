import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://ringster.ai";

const VALID_ROLES = ["admin", "listener", "transfer_only", "viewer"] as const;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: jsonHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "viewer");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: jsonHeaders });
    }
    if (!VALID_ROLES.includes(role as any)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400, headers: jsonHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Seat check via user's subscription plan
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("plan:subscription_plans(max_team_members)")
      .eq("user_id", user.id)
      .maybeSingle();
    const seatsLimit = (sub?.plan as any)?.max_team_members ?? 0;
    const { count: seatsUsed } = await admin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("owner_user_id", user.id)
      .neq("status", "revoked");
    if ((seatsUsed ?? 0) >= seatsLimit) {
      return new Response(
        JSON.stringify({ error: "Seat limit reached. Upgrade your plan to invite more teammates." }),
        { status: 403, headers: jsonHeaders }
      );
    }

    // Upsert team_members row
    const { data: member, error: memErr } = await admin
      .from("team_members")
      .upsert({
        owner_user_id: user.id,
        email,
        role,
        can_listen: !!body.can_listen,
        can_transfer: !!body.can_transfer,
        receives_notifications: body.receives_notifications !== false,
        status: "pending",
        invited_at: new Date().toISOString(),
        accepted_at: null,
        revoked_at: null,
      }, { onConflict: "owner_user_id,email" })
      .select()
      .single();
    if (memErr) throw memErr;

    // Generate token + store hash
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const token_hash = await sha256(token);
    const { error: invErr } = await admin.from("team_invites").insert({
      team_member_id: member.id,
      owner_user_id: user.id,
      email,
      token_hash,
    });
    if (invErr) throw invErr;

    const acceptUrl = `${APP_URL}/team/accept-invite?token=${token}`;

    // Fire email via Resend if configured
    if (RESEND_API_KEY) {
      const ownerName = user.user_metadata?.full_name ?? user.email ?? "Your teammate";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ringster <noreply@ringster.ai>",
          to: [email],
          subject: `${ownerName} invited you to their Ringster team`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 12px">You're invited to Ringster</h2>
              <p>${ownerName} has invited you to join their team on Ringster as <strong>${role.replace("_", " ")}</strong>.</p>
              <p>Accept the invite to start viewing live calls and (if enabled) listen in or transfer calls from the Ringster mobile app.</p>
              <p style="margin:24px 0">
                <a href="${acceptUrl}" style="background:#3b82f6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Accept invite</a>
              </p>
              <p style="color:#666;font-size:13px">This invite expires in 14 days.</p>
            </div>
          `,
        }),
      }).catch((e) => console.error("Resend error", e));
    }

    return new Response(JSON.stringify({ ok: true, member_id: member.id }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error("invite-team-member error", e);
    return new Response(JSON.stringify({ error: e.message ?? "Server error" }), { status: 500, headers: jsonHeaders });
  }
});
