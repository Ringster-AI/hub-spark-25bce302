import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { demoBusinessSchema } from './config';
import { prepareDemoCall } from './prepare';
import type { SupabaseDemoStore } from './store';
import type { VapiDemoProvider } from './provider';
import { processDemoEvent, eventKey } from './process-event';
import { demoErrorResponse, json, matchesDemoSecret } from './http';

type Request = { httpMethod: string; headers: Record<string, string | undefined>; body: string | null };
type Store = Pick<SupabaseDemoStore, 'reserve' | 'claimDispatch' | 'record' | 'ownedSession' | 'session' | 'list' | 'enqueue' | 'apply' | 'result' | 'pendingEvents'>;
type Provider = Pick<VapiDemoProvider, 'get' | 'create'>;
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), requestId: z.string().uuid(), business: demoBusinessSchema }).strict(),
  z.object({ action: z.literal('recover'), sessionId: z.string().uuid() }).strict(),
]);

export function demoSessionHandler(dependencies: {
  enabled: boolean;
  authenticate: (token: string) => Promise<{ id: string; verified: boolean } | null>;
  store: Store; provider: Provider; webhookUrl: string; webhookSecret: string;
}) {
  return async (request: Request) => {
    if (!dependencies.enabled) return json(404, { error: 'not_available' });
    if (!['GET', 'POST'].includes(request.httpMethod)) return json(405, { error: 'method_not_allowed' });
    const bearer = request.headers.authorization;
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim()) return json(401, { error: 'authentication_required' });
    try {
      const user = await dependencies.authenticate(bearer.slice(7));
      if (!user) return json(401, { error: 'authentication_required' });
      if (!user.verified) return json(403, { error: 'demo_verified_account_required' });
      const { store, provider } = dependencies;
      if (request.httpMethod === 'GET') {
        const sessions = await store.list(user.id);
        return json(200, { remaining: Math.max(0, 3 - sessions.filter(s => s.state !== 'failed_preconnect').length),
          maxDurationSeconds: 120, sessions: sessions.map(s => ({ id: s.id, state: s.state })) });
      }
      if (Buffer.byteLength(request.body ?? '') > 10000) return json(413, { error: 'request_too_large' });
      let raw: unknown;
      try { raw = JSON.parse(request.body ?? ''); } catch { return json(400, { error: 'invalid_request' }); }
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) return json(400, { error: 'invalid_request' });
      const input = parsed.data;
      if (input.action === 'prepare') {
        const prepared = await prepareDemoCall({ userId: user.id, requestId: input.requestId, business: input.business,
          webhookUrl: dependencies.webhookUrl, webhookSecret: dependencies.webhookSecret }, { store, provider });
        return json(prepared.state === 'ready' ? 200 : 202, prepared);
      }
      // Ownership must be established before provider lookup or replay.
      let session = await store.ownedSession(user.id, input.sessionId);
      for (const pending of await store.pendingEvents(session.id)) {
        await processDemoEvent({ eventKey: pending.event_key, sessionId: session.id, callId: pending.provider_call_id }, store, provider);
      }
      session = await store.ownedSession(user.id, input.sessionId);
      let webCallUrl: string | null = null;
      if (session.provider_call_id) {
        // Each recovery checks fresh provider evidence, never cached status.
        await processDemoEvent({ eventKey: `recovery-${randomUUID()}`, sessionId: session.id,
          callId: session.provider_call_id }, store, provider);
        session = await store.ownedSession(user.id, input.sessionId);
        if (session.state === 'ready') {
          const call = await provider.get(session.provider_call_id!);
          if (call.assistant.metadata.ringster_demo_session_id !== session.id) throw new Error('Demo ownership mismatch');
          if (['queued', 'scheduled', 'ringing'].includes(call.status)) webCallUrl = call.webCallUrl ?? call.transport?.callUrl ?? null;
        }
      }
      return json(200, { sessionId: session.id, state: session.state, webCallUrl,
        result: await store.result(session.id),
        needsReconciliation: session.state === 'uncertain' && !session.provider_call_id });
    } catch (error) { return demoErrorResponse(error); }
  };
}

const metadataSchema = z.object({ metadata: z.object({ ringster_demo_session_id: z.string().uuid() }).passthrough() }).passthrough();
const notificationSchema = z.object({ message: z.object({
  type: z.string(),
  call: z.object({ id: z.string().min(1).max(200), assistant: metadataSchema.optional() }).passthrough(),
  assistant: metadataSchema.optional(),
}).passthrough() });

export function demoWebhookHandler(dependencies: { enabled: boolean; secret: string; store: Store; provider: Provider }) {
  return async (request: Request) => {
    if (!dependencies.enabled) return json(404, { error: 'not_available' });
    if (request.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    const secret = request.headers.authorization?.replace(/^Bearer /i, '') ?? request.headers['x-vapi-secret'];
    if (!matchesDemoSecret(secret, dependencies.secret)) return json(401, { error: 'unauthorized' });
    if (Buffer.byteLength(request.body ?? '') > 1000000) return json(413, { error: 'request_too_large' });
    let parsed: z.infer<typeof notificationSchema>;
    try { parsed = notificationSchema.parse(JSON.parse(request.body ?? '')); }
    catch { return json(400, { error: 'invalid_notification' }); }
    if (!['status-update', 'end-of-call-report'].includes(parsed.message.type)) return json(200, { ignored: true });
    const sessionId = parsed.message.call.assistant?.metadata.ringster_demo_session_id
      ?? parsed.message.assistant?.metadata.ringster_demo_session_id;
    if (!sessionId) return json(400, { error: 'demo_session_missing' });
    try {
      await processDemoEvent({ eventKey: eventKey(request.body!), sessionId, callId: parsed.message.call.id }, dependencies.store, dependencies.provider);
      return json(200, { received: true });
    } catch {
      // Inbox entry remains pending; a retry or owner recovery reprocesses it.
      return json(503, { error: 'demo_processing_pending' });
    }
  };
}
