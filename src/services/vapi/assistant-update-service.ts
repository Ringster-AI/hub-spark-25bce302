
import { supabase } from "@/integrations/supabase/client";
import { getNetlifyFunctionsUrl } from "@/utils/netlifyFunctions";

// Debounce/coalesce concurrent sync requests per agent so rapid edits result
// in a single Vapi call rather than one per keystroke/save.
const DEBOUNCE_MS = 600;

type PendingSync = {
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<any>;
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

const pending = new Map<string, PendingSync>();
const inflight = new Map<string, Promise<any>>();

async function performSync(agentId: string) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    console.error("No active session for VAPI sync");
    throw new Error("Authentication required to sync agent");
  }

  const { data: agent, error } = await supabase
    .from("agent_configs")
    .select("vapi_assistant_id")
    .eq("id", agentId)
    .single();

  if (error || !agent) {
    console.error("Error fetching agent:", error);
    throw new Error("Failed to fetch agent data");
  }

  if (!agent.vapi_assistant_id) {
    console.log("No VAPI assistant ID found for agent, skipping sync");
    return;
  }

  const requestId = `assist-sync-${agentId}-${Date.now()}`;
  const maxRetries = 2;
  const baseDelayMs = 300;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(getNetlifyFunctionsUrl('manage-vapi-assistant'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ agentId, action: 'update' }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update VAPI assistant: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Successfully synced agent ${agentId}`, {
        requestId,
        action: result.action,
      });
      return result;
    } catch (err) {
      console.error(`Sync attempt ${attempt + 1} failed for agent ${agentId}`, { requestId, err });
      if (attempt === maxRetries) throw err;
      await new Promise((res) => setTimeout(res, baseDelayMs * Math.pow(2, attempt)));
    }
  }
}

export class VapiAssistantUpdateService {
  /**
   * Schedule a sync for the given agent. Multiple calls within DEBOUNCE_MS
   * coalesce into a single Vapi update. If a sync is already in-flight for
   * the agent, the new call waits for it to finish and then runs once more.
   */
  static syncAgentWithVapi(agentId: string): Promise<any> {
    const existing = pending.get(agentId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => fire(agentId), DEBOUNCE_MS);
      return existing.promise;
    }

    let resolve!: (v: any) => void;
    let reject!: (e: any) => void;
    const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
    const timer = setTimeout(() => fire(agentId), DEBOUNCE_MS);
    pending.set(agentId, { timer, promise, resolve, reject });
    return promise;
  }
}

async function fire(agentId: string) {
  const entry = pending.get(agentId);
  if (!entry) return;
  pending.delete(agentId);

  // Serialize per-agent: if one is already running, chain after it.
  const prior = inflight.get(agentId) ?? Promise.resolve();
  const run = prior
    .catch(() => undefined)
    .then(() => performSync(agentId));

  inflight.set(agentId, run);
  try {
    const result = await run;
    entry.resolve(result);
  } catch (err) {
    entry.reject(err);
  } finally {
    if (inflight.get(agentId) === run) inflight.delete(agentId);
  }
}
