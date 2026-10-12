import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
} from "./run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_TRANSCRIPT_CHARS = 60_000;

const SYSTEM_PROMPT = `You are a US telemarketing compliance reviewer for an AI phone agent platform.
Review the call transcript for risks related to:
- consent: TCPA prior express (written) consent, calling someone who says they never agreed, autodialed/AI calls without consent.
- disclosure: failure to identify the business, failure to disclose the caller is an AI/automated, failure to disclose call recording (two-party consent states), misleading claims.
- do_not_call: caller asks to stop/be removed/not called again and the agent ignores it, keeps pitching, or does not confirm removal.
- other: harassment, calling-time complaints, or other notable compliance risks.
Quote short exact excerpts as evidence. Only report risks supported by the transcript. This is a risk screen, not legal advice.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["overall_risk", "summary", "findings", "positive_practices"],
  properties: {
    overall_risk: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "title", "evidence", "explanation", "recommendation"],
        properties: {
          category: { type: "string", enum: ["consent", "disclosure", "do_not_call", "other"] },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          title: { type: "string" },
          evidence: { type: "string" },
          explanation: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
    positive_practices: { type: "array", items: { type: "string" } },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isSuper && !isAdmin) return json({ error: "Forbidden: admin only" }, 403);

  let body: { transcript?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (transcript.length < 20) return json({ error: "Please paste a transcript of at least 20 characters." }, 400);
  if (transcript.length > MAX_TRANSCRIPT_CHARS)
    return json({ error: `Transcript is too long (max ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters).` }, 400);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI is not configured for this project." }, 500);

  const gateway = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  try {
    const upstream = await gateway.fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transcript:\n"""\n${transcript}\n"""` },
        ],
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "compliance_review", strict: true, schema } },
      }),
    });

    const headers = getLovableAiGatewayResponseHeaders(upstream.headers, corsHeaders);
    if (!upstream.ok) {
      const text = await upstream.text();
      let message = "AI analysis failed.";
      try {
        const parsed = JSON.parse(text);
        message = parsed?.error?.message || parsed?.message || message;
      } catch { /* keep default */ }
      if (upstream.status === 429) message = "Too many requests right now. Please try again in a minute.";
      if (upstream.status === 402) message = message || "AI credits are exhausted.";
      headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: message }), { status: upstream.status, headers });
    }
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/event-stream");
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    if (req.signal.aborted && error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499, headers: corsHeaders });
    }
    console.error("analyze-call-compliance error", error);
    return json({ error: "AI analysis failed." }, 500);
  }
});
