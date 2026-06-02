// Daily lifecycle email scanner — invoked by pg_cron.
// Sends:
//  - trial-ending 3-day warning to users whose trial ends in ~2–3 days
//  - onboarding-nudge to users 2–3 days old who haven't completed first call
// Both rely on idempotencyKey to prevent duplicate sends across cron runs.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function send(templateName: string, recipientEmail: string, idempotencyKey: string, templateData: Record<string, unknown>) {
  try {
    await admin.functions.invoke("send-transactional-email", {
      body: { templateName, recipientEmail, idempotencyKey, templateData },
    });
    return true;
  } catch (e) {
    console.error(`send ${templateName} → ${recipientEmail} failed`, e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = new Date();
  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  let trialSent = 0;
  let nudgeSent = 0;

  // ---- Trial ending in ~3 days ----
  try {
    const { data: trials, error } = await admin
      .from("user_subscriptions")
      .select("user_id, trial_ends_at, profiles!inner(email, full_name)")
      .eq("status", "trialing")
      .gte("trial_ends_at", in2Days)
      .lte("trial_ends_at", in3Days);

    if (error) console.error("trial scan error", error);
    for (const row of trials ?? []) {
      const profile = (row as any).profiles;
      if (!profile?.email) continue;
      const trialEnd = new Date((row as any).trial_ends_at);
      const dayKey = trialEnd.toISOString().slice(0, 10);
      const ok = await send(
        "trial-ending",
        profile.email,
        `trial-ending-${(row as any).user_id}-${dayKey}`,
        { name: profile.full_name ?? undefined, daysLeft: 3 },
      );
      if (ok) trialSent++;
    }
  } catch (e) {
    console.error("trial block error", e);
  }

  // ---- Onboarding nudge: signed up 2–3 days ago, no first call yet ----
  try {
    const { data: stale, error } = await admin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .is("first_call_acknowledged_at", null)
      .gte("created_at", twoDaysAgo)
      .lte("created_at", oneDayAgo);

    if (error) console.error("nudge scan error", error);
    for (const p of stale ?? []) {
      if (!p.email) continue;
      const dayKey = new Date(p.created_at).toISOString().slice(0, 10);
      const ok = await send(
        "onboarding-nudge",
        p.email,
        `onboarding-nudge-${p.id}-${dayKey}`,
        { name: p.full_name ?? undefined },
      );
      if (ok) nudgeSent++;
    }
  } catch (e) {
    console.error("nudge block error", e);
  }

  return new Response(
    JSON.stringify({ ok: true, trialSent, nudgeSent, runAt: now.toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
