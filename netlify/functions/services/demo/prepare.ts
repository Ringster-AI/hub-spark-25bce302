import { createDemoAssistant, type DemoBusiness } from './config';

export type DemoSession = {
  id: string;
  state: 'reserved' | 'uncertain' | 'ready' | 'connected' | 'completed' | 'failed_preconnect';
  provider_call_id: string | null;
};
export interface DemoStore {
  reserve(userId: string, requestId: string): Promise<DemoSession>;
  claimDispatch(sessionId: string): Promise<boolean>;
  record(sessionId: string, state: 'ready' | 'failed_preconnect', callId: string | null, failure?: string): Promise<void>;
}
export interface DemoProvider {
  // An implementation MUST send only once. Creation cannot be automatically
  // retried after transport failures, invalid responses or provider 5xx errors.
  create(assistant: ReturnType<typeof createDemoAssistant>): Promise<{ id: string; webCallUrl: string }>;
}
export class ConfirmedDemoRejection extends Error {}

/** Server-only orchestration; userId must come from verified authentication. */
export async function prepareDemoCall(input: {
  userId: string; requestId: string; business: DemoBusiness;
  webhookUrl: string; webhookSecret: string;
}, dependencies: { store: DemoStore; provider: DemoProvider }) {
  // Validate business/config before reserving an allowance slot.
  createDemoAssistant(input.business, {
    sessionId: 'validation', webhookUrl: input.webhookUrl, webhookSecret: input.webhookSecret,
  });
  const { store, provider } = dependencies;
  const session = await store.reserve(input.userId, input.requestId);
  if (session.state !== 'reserved') {
    // Do not create again or return another caller's cached credentials.
    return { sessionId: session.id, state: session.state, webCallUrl: null };
  }
  if (!await store.claimDispatch(session.id)) {
    return { sessionId: session.id, state: 'uncertain' as const, webCallUrl: null };
  }
  let call: { id: string; webCallUrl: string };
  try {
    call = await provider.create(createDemoAssistant(input.business, {
      sessionId: session.id, webhookUrl: input.webhookUrl, webhookSecret: input.webhookSecret,
    }));
  } catch (error) {
    if (error instanceof ConfirmedDemoRejection) {
      await store.record(session.id, 'failed_preconnect', null, 'provider_rejected_request');
    }
    // All other outcomes retain the durable uncertain reservation.
    throw error;
  }
  if (!call.id?.trim() || !call.webCallUrl?.startsWith('https://')) {
    throw new Error('Uncertain demo creation response; reconciliation required');
  }
  // Persist the provider binding before allowing the browser to join.
  // A persistence failure must never refund or automatically re-create a call.
  await store.record(session.id, 'ready', call.id);
  return { sessionId: session.id, state: 'ready' as const, webCallUrl: call.webCallUrl };
}
