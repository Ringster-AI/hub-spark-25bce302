// Vapi end-of-call webhook → finalize_call RPC (idempotent, single transaction)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vapi-secret, x-vapi-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVE_STATUSES = ["scheduled", "queued", "ringing", "in-progress", "forwarding", "transferring"];
const ENDED_STATUSES = ["ended", "failed"];
const STATUS_ALIASES: Record<string, string> = {
  forwarding: "transferring",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPI_SERVER_SECRET = Deno.env.get("VAPI_SERVER_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function ok(body: unknown = { received: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "method not allowed" }, 405);

  // Shared-secret auth — supports Vapi "Bearer Auth", "Secret Token", or assistant-level server.secret
  if (VAPI_SERVER_SECRET) {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const provided =
      bearer ??
      req.headers.get("x-vapi-secret") ??
      req.headers.get("x-vapi-signature");
    if (provided !== VAPI_SERVER_SECRET) {
      console.warn("vapi-webhook: bad secret");
      return ok({ error: "unauthorized" }, 401);
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return ok({ error: "invalid json" }, 400);
  }

  const message = payload?.message ?? payload;
  const type = message?.type;

  // Helpers shared across event types ---------------------------------------
  const call = message?.call ?? {};
  const assistantId: string | undefined = call.assistantId ?? message?.assistantId;
  const vapiCallId: string | undefined = call.id ?? message?.callId;

  async function resolveOwner(): Promise<{ userId: string | null; agentId: string | null }> {
    const metadata = call.metadata ?? message.metadata ?? {};
    let userId: string | null = metadata.user_id ?? metadata.userId ?? null;
    let agentId: string | null = metadata.agent_id ?? metadata.agentId ?? null;
    if ((!userId || !agentId) && assistantId) {
      const { data: agent } = await admin
        .from("agent_configs")
        .select("id, user_id")
        .eq("vapi_assistant_id", assistantId)
        .maybeSingle();
      if (agent) {
        userId = userId ?? agent.user_id;
        agentId = agentId ?? agent.id;
      }
    }
    return { userId, agentId };
  }

  // ---- Live call events (call-start, status-update, transcript) -----------
  const rawStatus = String(message?.status ?? message?.call?.status ?? "").toLowerCase();
  const isLiveStatusUpdate = type === "status-update" && LIVE_STATUSES.includes(rawStatus);
  if (type === "call-start" || type === "transcript" || isLiveStatusUpdate) {
    if (!vapiCallId) return ok({ ignored: "no_call_id" });
    const { userId, agentId } = await resolveOwner();
    if (!userId) return ok({ ignored: "no_owner" });

    const statusFromVapi: string = type === "call-start"
      ? "in-progress"
      : (message?.status ?? message?.call?.status ?? "in-progress");
    const normalizedStatus = STATUS_ALIASES[String(statusFromVapi).toLowerCase()] ?? String(statusFromVapi).toLowerCase();
    const safeStatus = ["ringing", "in-progress", "transferring", "ended", "failed"].includes(normalizedStatus)
      ? normalizedStatus
      : "in-progress";

    const callerNumber = call.customer?.number ?? call.from ?? null;
    const callerName = call.customer?.name ?? null;

    const { data: ac, error: acErr } = await admin
      .from("active_calls")
      .upsert({
        user_id: userId,
        agent_id: agentId,
        vapi_call_id: vapiCallId,
        caller_number: callerNumber,
        caller_name: callerName,
        status: safeStatus,
        updated_at: new Date().toISOString(),
      }, { onConflict: "vapi_call_id" })
      .select("id")
      .single();

    if (acErr) {
      console.error("active_calls upsert failed", acErr);
    } else if (ac) {
      await admin.from("call_events").insert({
        active_call_id: ac.id,
        event_type: type,
        payload: message ?? {},
      });

      // Push notification when the live row is first created
      if (type === "call-start" || (type === "status-update" && safeStatus === "ringing")) {
        try {
          await admin.functions.invoke("send-push-notification", {
            body: {
              owner_user_id: userId,
              title: "Incoming call",
              body: callerName ? `${callerName} · ${callerNumber ?? ""}` : (callerNumber ?? "New call"),
              data: { active_call_id: ac.id, vapi_call_id: vapiCallId },
            },
          });
        } catch (e) {
          console.error("push notify failed", e);
        }
      }
    }
    return ok({ handled: type, status: safeStatus });
  }

  if (type === "status-update" && ENDED_STATUSES.includes(rawStatus) && vapiCallId) {
    await admin
      .from("active_calls")
      .update({
        status: rawStatus,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("vapi_call_id", vapiCallId);
    return ok({ handled: type, status: rawStatus });
  }

  // Vapi fires many event types — only the report below finalizes call_logs
  if (type !== "end-of-call-report") {
    return ok({ ignored: type ?? "unknown" });
  }

  try {
    const call = message.call ?? {};
    const artifact = message.artifact ?? {};
    const metadata = call.metadata ?? message.metadata ?? {};

    const vapiCallId: string | undefined = call.id ?? message.callId;
    const assistantId: string | undefined = call.assistantId ?? message.assistantId;
    const durationSeconds: number = Math.round(
      message.durationSeconds ?? message.duration ?? call.duration ?? 0
    );
    const startedAt = message.startedAt ?? call.startedAt ?? null;
    const endedAt = message.endedAt ?? call.endedAt ?? null;
    const fromNumber = call.customer?.number ?? call.from ?? null;
    const toNumber = call.phoneNumber?.number ?? call.to ?? null;
    const recordingUrl = artifact.recordingUrl ?? message.recordingUrl ?? null;
    const transcriptUrl = artifact.transcript ?? message.transcript ?? null;

    if (!vapiCallId) return ok({ error: "missing call id" }, 400);

    // Resolve user_id + agent_id: prefer metadata, fall back to assistant lookup
    let userId: string | null = metadata.user_id ?? metadata.userId ?? null;
    let agentId: string | null = metadata.agent_id ?? metadata.agentId ?? null;

    if ((!userId || !agentId) && assistantId) {
      const { data: agent } = await admin
        .from("agent_configs")
        .select("id, user_id")
        .eq("vapi_assistant_id", assistantId)
        .maybeSingle();
      if (agent) {
        userId = userId ?? agent.user_id;
        agentId = agentId ?? agent.id;
      }
    }

    if (!userId || !agentId) {
      console.error("vapi-webhook: cannot resolve user/agent", { vapiCallId, assistantId });
      return ok({ error: "agent not resolvable" }, 200); // 200 so Vapi stops retrying
    }

    const { data, error } = await admin.rpc("finalize_call", {
      p_user_id: userId,
      p_agent_id: agentId,
      p_vapi_call_id: vapiCallId,
      p_duration_seconds: durationSeconds,
      p_from_number: fromNumber,
      p_to_number: toNumber,
      p_recording_url: typeof recordingUrl === "string" ? recordingUrl : null,
      p_transcript_url: typeof transcriptUrl === "string" ? transcriptUrl : null,
      p_started_at: startedAt,
      p_ended_at: endedAt,
    });

    if (error) {
      console.error("finalize_call failed", error);
      return ok({ error: error.message }, 500);
    }

    const callLogId = data;

    // Mark live call as ended + append final event
    if (vapiCallId) {
      const { data: ac } = await admin
        .from("active_calls")
        .update({
          status: "ended",
          ended_at: endedAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("vapi_call_id", vapiCallId)
        .select("id")
        .maybeSingle();
      if (ac) {
        await admin.from("call_events").insert({
          active_call_id: ac.id,
          call_log_id: callLogId,
          event_type: "end-of-call-report",
          payload: { duration_seconds: durationSeconds },
        });
      }
    }

    // Lifecycle/transactional emails ----------------------------------------
    try {
      const { data: owner } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .maybeSingle();

      const ownerEmail = owner?.email as string | undefined;
      if (ownerEmail) {
        const endedReason = String(message?.endedReason ?? call?.endedReason ?? "").toLowerCase();
        const isMissed =
          durationSeconds < 5 ||
          endedReason.includes("no-answer") ||
          endedReason.includes("did-not-answer") ||
          endedReason.includes("voicemail") ||
          endedReason.includes("busy");
        const callTimeStr = endedAt
          ? new Date(endedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
          : undefined;

        if (isMissed) {
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "missed-call-summary",
              recipientEmail: ownerEmail,
              idempotencyKey: `missed-call-${vapiCallId}`,
              templateData: {
                fromNumber,
                callTime: callTimeStr,
                reason: endedReason || "no answer",
              },
            },
          });
        } else if (recordingUrl) {
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "call-recording-ready",
              recipientEmail: ownerEmail,
              idempotencyKey: `recording-${vapiCallId}`,
              templateData: {
                fromNumber,
                callTime: callTimeStr,
                duration: durationSeconds,
                recordingUrl,
              },
            },
          });
        }

        // Low-credit warning: after this call's deduction, check remaining vs plan allowance
        const { data: credits } = await admin
          .from("user_credits")
          .select("credits_remaining, current_period_start")
          .eq("user_id", userId)
          .maybeSingle();
        const { data: sub } = await admin
          .from("user_subscriptions")
          .select("subscription_plans(name, credits_allowance)")
          .eq("user_id", userId)
          .maybeSingle();
        const allowance = (sub as any)?.subscription_plans?.credits_allowance ?? 0;
        const remaining = credits?.credits_remaining ?? 0;
        if (allowance > 0 && remaining > 0 && remaining < allowance * 0.2) {
          const periodKey = credits?.current_period_start ?? "no-period";
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "low-credit-warning",
              recipientEmail: ownerEmail,
              idempotencyKey: `low-credit-${userId}-${periodKey}`,
              templateData: {
                name: owner?.full_name ?? undefined,
                creditsRemaining: remaining,
                planName: (sub as any)?.subscription_plans?.name,
              },
            },
          });
        }
      }
    } catch (emailErr) {
      console.error("post-call email enqueue failed", emailErr);
    }

    return ok({ call_log_id: callLogId, minutes_charged: Math.max(1, Math.ceil(durationSeconds / 60)) });

  } catch (err: any) {
    console.error("vapi-webhook error", err);
    return ok({ error: err?.message ?? "unknown" }, 500);
  }
});
