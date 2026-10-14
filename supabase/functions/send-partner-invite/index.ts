import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://ringster.ai";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_partner_admin", { _uid: user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const partnerId = String(body.partner_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(partnerId)) return json({ error: "Invalid partner_id" }, 400);

    const { data: p, error } = await admin.from("partners")
      .select("invite_email, display_name, referral_code").eq("id", partnerId).maybeSingle();
    if (error || !p) return json({ error: "Partner not found" }, 404);
    if (!RESEND_API_KEY) return json({ error: "Email sending is not configured (RESEND_API_KEY missing)" }, 500);

    const email = String(p.invite_email).toLowerCase();
    const link = `${APP_URL}/login?next=${encodeURIComponent("/partner")}`;
    const name = p.display_name ? esc(p.display_name) : "there";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Ringster <noreply@ringster.ai>",
        to: [email],
        subject: "You're invited to the Ringster Partner Program",
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px">Welcome to the Ringster Partner Program</h2>
          <p>Hi ${name},</p>
          <p>You've been invited to become a Ringster partner. Your partner dashboard gives you your referral link, prospect registration, demo booking and commission tracking.</p>
          <p>Sign in or create an account using <strong>${esc(email)}</strong>, then review and accept the partner agreement.</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#3b82f6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open partner dashboard</a></p>
          <p style="color:#666;font-size:13px">Your referral code: <strong>${esc(p.referral_code ?? "")}</strong></p>
        </div>`,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`Resend failed [${r.status}]: ${t}`);
      return json({ error: "Email failed to send", status: r.status, details: t }, 502);
    }
    return json({ ok: true });
  } catch (e: any) {
    console.error("send-partner-invite error", e);
    return json({ error: e.message ?? "Server error" }, 500);
  }
});
