import type { ProviderCall } from './provider';
import type { DemoSession } from './prepare';

export type DemoEvidence = {
  state: 'ready' | 'connected' | 'completed' | 'failed_preconnect';
  duration: number | null;
  failure: string | null;
  transcript: string | null;
};

/** Use only authenticated server GET results, not browser reports. */
export function classifyDemoCall(session: DemoSession, call: ProviderCall): DemoEvidence | null {
  if (call.assistant.metadata.ringster_demo_session_id !== session.id ||
      (session.provider_call_id !== null && session.provider_call_id !== call.id)) {
    throw new Error('Demo call ownership mismatch');
  }
  if (call.status === 'ended') {
    const duration = call.startedAt && call.endedAt
      ? Math.max(0, (Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000) : null;
    // Fail conservatively: do not infer no conversation from a short duration.
    // Only the documented customer-join timeout with no transcript qualifies.
    const transcript = call.artifact?.transcript ?? call.transcript ?? null;
    const noCustomer = call.endedReason === 'assistant-did-not-receive-customer-audio';
    if (noCustomer && !transcript?.trim() && session.state !== 'connected') {
      return { state: 'failed_preconnect', duration: 0, failure: call.endedReason!, transcript: null };
    }
    return { state: 'completed', duration, failure: null, transcript };
  }
  if (call.status === 'in-progress') return { state: 'connected', duration: null, failure: null, transcript: null };
  if (['queued', 'scheduled', 'ringing'].includes(call.status)) {
    return { state: 'ready', duration: null, failure: null, transcript: null };
  }
  return null;
}
