// In-call SMS tool: lets a Vapi assistant text the current caller mid-call
// (links, addresses, confirmations). Authenticated via the shared
// VAPI_CALENDAR_SECRET, same pattern as vapi-calendar-api.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vapi-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALENDAR_SECRET = Deno.env.get("VAPI_CALENDAR_SECRET");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const RINGSTER_OUTBOUND_NUMBER = "+16204458363";

const MAX_MESSAGE_LENGTH = 300;
const MAX_SMS_PER_CALL = 3;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length >= 11 ? digits : null;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: true, message: "Method not allowed" }, 405);

  // Shared-secret auth (same as vapi-calendar-api). Fail closed if unset.
  if (!CALENDAR_SECRET) {
    console.error("vapi-sms-tool: VAPI_CALENDAR_SECRET is not configured");
    return ok({ error: true, message: "Messaging is not configured." }, 500);
  }
  if (req.headers.get("x-vapi-secret") !== CALENDAR_SECRET) {
    return ok({ error: true, message: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ok({ error: true, message: "Invalid request." }, 400);
  }

  const assistantId: string | undefined = body.assistant_id;
  const rawMessage: string = typeof body.message === "string" ? body.message.trim() : "";
  const toOverride = normalizeE164(body.to_number);

  if (!assistantId) return ok({ error: true, message: "Missing assistant reference." }, 400);
  if (!rawMessage) {
    return ok({ error: true, message: "There was no message to send. Ask the caller what they'd like to receive." });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return ok({ error: true, message: `The text is too long. Keep it under ${MAX_MESSAGE_LENGTH} characters and try again.` });
  }

  // Resolve the agent + owner from the assistant ID.
  const { data: agent } = await admin
    .from("agent_configs")
    .select("id, user_id, name")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle();
  if (!agent) {
    console.error("vapi-sms-tool: assistant not resolvable", { assistantId });
    return ok({ error: true, message: "I couldn't send the text just now." });
  }

  // Find the caller: the agent's most recent live call.
  const { data: liveCall } = await admin
    .from("active_calls")
    .select("id, vapi_call_id, caller_number, status")
    .eq("agent_id", agent.id)
    .in("status", ["ringing", "in-progress", "transferring"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const toNumber = toOverride ?? normalizeE164(liveCall?.caller_number);
  if (!toNumber) {
    return ok({ error: true, message: "I don't have a mobile number to text. Ask the caller for the number they'd like the text sent to, then try again with that number." });
  }

  // Do-not-call suppression: never text a number the owner has suppressed.
  const { data: dnc } = await admin
    .from("do_not_call_entries")
    .select("id")
    .eq("user_id", agent.user_id)
    .limit(200);
  const suppressed = new Set((dnc ?? []).map((r: any) => digitsOnly(r.phone_number)));
  if (suppressed.has(digitsOnly(toNumber))) {
    return ok({ error: true, message: "This number has asked not to receive texts, so I can't message it." });
  }

  // Per-call rate limit: max MAX_SMS_PER_CALL texts per live call.
  if (liveCall?.id) {
    const { count } = await admin
      .from("tool_call_logs")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id)
      .eq("tool_name", "send_sms_to_caller")
      .eq("status", "success")
      .gte("timestamp", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= MAX_SMS_PER_CALL) {
      return ok({ error: true, message: "I've already sent a few texts during this call, so I can't send another one right now." });
    }
  }

  // Send via Twilio.
  let status = "success";
  let result: Record<string, unknown> = { to: toNumber };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("vapi-sms-tool: Twilio credentials not configured");
    status = "error";
    result = { error: "not_configured" };
  } else {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toNumber,
        From: RINGSTER_OUTBOUND_NUMBER,
        Body: rawMessage,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`vapi-sms-tool: Twilio failed (${res.status}): ${text}`);
      status = "error";
      result = { error: `twilio_${res.status}` };
    } else {
      const data = await res.json().catch(() => ({}));
      result = { to: toNumber, sid: data?.sid ?? null };
    }
  }

  // Audit log (agent_id FK cascades on agent delete).
  try {
    await admin.from("tool_call_logs").insert({
      agent_id: agent.id,
      tool_name: "send_sms_to_caller",
      parameters: { message: rawMessage, to: toNumber, vapi_call_id: liveCall?.vapi_call_id ?? null },
      result,
      status,
    });
  } catch (e) {
    console.error("vapi-sms-tool: log insert failed", e);
  }

  if (status !== "success") {
    return ok({ error: true, message: "The text couldn't be sent just now. Apologize and offer to share the information out loud instead." });
  }
  return ok({ success: true, message: "Text message sent successfully. Confirm to the caller that it's on its way." });
});
