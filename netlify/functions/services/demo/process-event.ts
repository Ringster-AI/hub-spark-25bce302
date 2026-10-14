import { createHash } from 'node:crypto';
import { classifyDemoCall } from './recovery';
import type { SupabaseDemoStore } from './store';
import type { VapiDemoProvider } from './provider';

export async function processDemoEvent(event: {
  eventKey: string; sessionId: string; callId: string;
}, store: Pick<SupabaseDemoStore, 'enqueue' | 'session' | 'apply'>, provider: Pick<VapiDemoProvider, 'get'>) {
  // Durable inbox entry commits before fetching/processing provider evidence.
  const inbox = await store.enqueue(event.eventKey, event.sessionId, event.callId);
  if (inbox.processed_at) return;
  const session = await store.session(inbox.session_id);
  const call = await provider.get(inbox.provider_call_id);
  const evidence = classifyDemoCall(session, call);
  if (!evidence) throw new Error('Demo provider evidence not ready');
  await store.apply(inbox.id, evidence);
}

export function eventKey(body: string) {
  return createHash('sha256').update(body).digest('hex');
}
