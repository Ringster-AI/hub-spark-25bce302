import { describe, expect, it, vi } from 'vitest';
import { demoSessionHandler, demoWebhookHandler } from '../../netlify/functions/services/demo/handlers';
import { processDemoEvent } from '../../netlify/functions/services/demo/process-event';
import type { StoredDemoSession } from '../../netlify/functions/services/demo/store';

const sessionId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const business = { businessName: 'Maple', businessType: 'Plumber', services: 'Repairs', serviceArea: 'Toronto', hours: '9–5', agentName: 'Sam' };
const session: StoredDemoSession = { id: sessionId, user_id: userId, state: 'reserved', provider_call_id: null, business_snapshot: business };
function fixtures() {
  const store = {
    reserve: vi.fn().mockResolvedValue(session), claimDispatch: vi.fn().mockResolvedValue(true),
    record: vi.fn().mockResolvedValue({ ...session, state: 'ready', provider_call_id: 'call' }),
    ownedSession: vi.fn().mockResolvedValue(session), session: vi.fn().mockResolvedValue(session),
    list: vi.fn().mockResolvedValue([session]), result: vi.fn().mockResolvedValue(null),
    pendingEvents: vi.fn().mockResolvedValue([]),
    enqueue: vi.fn().mockResolvedValue({ id: 'event', processed_at: null, session_id: sessionId, provider_call_id: 'call' }),
    apply: vi.fn().mockResolvedValue({ ...session, state: 'completed', provider_call_id: 'call' }),
  };
  const provider = {
    create: vi.fn().mockResolvedValue({ id: 'call', webCallUrl: 'https://example.daily.co/room' }),
    get: vi.fn().mockResolvedValue({ id: 'call', type: 'webCall', status: 'ended', assistant: { metadata: { ringster_demo_session_id: sessionId } }, artifact: { transcript: 'Customer: My sink leaks.' } }),
  };
  return { enabled: true, store, provider,
    authenticate: vi.fn().mockResolvedValue({ id: userId, verified: true }),
    webhookUrl: 'https://example.invalid/demo', webhookSecret: 'fixture-secret', secret: 'fixture-secret' };
}
const prepareRequest = { httpMethod: 'POST', headers: { authorization: 'Bearer fixture-token' },
  body: JSON.stringify({ action: 'prepare', requestId: sessionId, business }) };
const webhookRequest = { httpMethod: 'POST', headers: { 'x-vapi-secret': 'fixture-secret' },
  body: JSON.stringify({ message: { type: 'end-of-call-report', call: { id: 'call', assistant: { metadata: { ringster_demo_session_id: sessionId } } } } }) };

describe('gated authenticated demo endpoints', () => {
  it('is inactive without the feature flag and never accesses provider or storage', async () => {
    const deps = fixtures(); deps.enabled = false;
    expect((await demoSessionHandler(deps)(prepareRequest)).statusCode).toBe(404);
    expect((await demoWebhookHandler(deps)(webhookRequest)).statusCode).toBe(404);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.store.reserve).not.toHaveBeenCalled();
    expect(deps.provider.create).not.toHaveBeenCalled();
  });
  it('rejects anonymous and unverified callers before reserving', async () => {
    const deps = fixtures();
    expect((await demoSessionHandler(deps)({ ...prepareRequest, headers: {} })).statusCode).toBe(401);
    deps.authenticate.mockResolvedValue({ id: userId, verified: false });
    expect((await demoSessionHandler(deps)(prepareRequest)).statusCode).toBe(403);
    expect(deps.store.reserve).not.toHaveBeenCalled();
  });
  it('derives the user from authentication and rejects submitted identity or provider overrides', async () => {
    const deps = fixtures();
    expect((await demoSessionHandler(deps)(prepareRequest)).statusCode).toBe(200);
    expect(deps.store.reserve).toHaveBeenCalledWith(userId, sessionId, business);
    for (const extra of [{ userId: 'victim' }, { assistantOverrides: { maxDurationSeconds: 600 } }]) {
      expect((await demoSessionHandler(deps)({ ...prepareRequest,
        body: JSON.stringify({ action: 'prepare', requestId: sessionId, business, ...extra }) })).statusCode).toBe(400);
    }
  });
  it('checks ownership before recovering or looking up provider data', async () => {
    const deps = fixtures(); deps.store.ownedSession.mockRejectedValue(new Error('demo_session_not_found'));
    expect((await demoSessionHandler(deps)({ ...prepareRequest, body: JSON.stringify({ action: 'recover', sessionId }) })).statusCode).toBe(404);
    expect(deps.provider.get).not.toHaveBeenCalled();
    expect(deps.store.pendingEvents).not.toHaveBeenCalled();
  });
  it('reports remaining allowance and no provider credentials', async () => {
    const deps = fixtures();
    const response = await demoSessionHandler(deps)({ ...prepareRequest, httpMethod: 'GET', body: null });
    expect(JSON.parse(response.body)).toEqual({ remaining: 2, maxDurationSeconds: 120, sessions: [{ id: sessionId, state: 'reserved' }] });
    expect(response.headers['Cache-Control']).toBe('no-store');
  });
  it('sanitizes internal errors', async () => {
    const deps = fixtures(); deps.store.reserve.mockRejectedValue(new Error('database details private-key'));
    const response = await demoSessionHandler(deps)(prepareRequest);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private-key');
  });
  it('does not return a join URL after an early final webhook won the race', async () => {
    const deps = fixtures(); deps.store.record.mockResolvedValue({ ...session, state: 'completed' });
    const response = await demoSessionHandler(deps)(prepareRequest);
    expect(JSON.parse(response.body).webCallUrl).toBeNull();
  });
});

describe('durable demo notification processing', () => {
  it('rejects unauthenticated webhook payloads without persisting them', async () => {
    const deps = fixtures();
    expect((await demoWebhookHandler(deps)({ ...webhookRequest, headers: { 'x-vapi-secret': 'wrong' } })).statusCode).toBe(401);
    expect(deps.store.enqueue).not.toHaveBeenCalled();
  });
  it('persists only identifiers before fetching authoritative evidence', async () => {
    const deps = fixtures();
    expect((await demoWebhookHandler(deps)(webhookRequest)).statusCode).toBe(200);
    expect(deps.store.enqueue).toHaveBeenCalledWith(expect.any(String), sessionId, 'call');
    expect(deps.store.enqueue.mock.invocationCallOrder[0]).toBeLessThan(deps.provider.get.mock.invocationCallOrder[0]);
    expect(deps.store.apply).toHaveBeenCalledWith('event', expect.objectContaining({ state: 'completed', transcript: 'Customer: My sink leaks.' }));
  });
  it('leaves persisted work pending on provider failure and processes a retry', async () => {
    const deps = fixtures(); deps.provider.get.mockRejectedValueOnce(new Error('provider unavailable'));
    expect((await demoWebhookHandler(deps)(webhookRequest)).statusCode).toBe(503);
    expect(deps.store.apply).not.toHaveBeenCalled();
    expect((await demoWebhookHandler(deps)(webhookRequest)).statusCode).toBe(200);
    expect(deps.store.apply).toHaveBeenCalledTimes(1);
  });
  it('skips already processed events', async () => {
    const deps = fixtures(); deps.store.enqueue.mockResolvedValue({ id: 'event', processed_at: '2026-10-13', session_id: sessionId, provider_call_id: 'call' });
    await processDemoEvent({ eventKey: 'duplicate', sessionId, callId: 'call' }, deps.store, deps.provider);
    expect(deps.provider.get).not.toHaveBeenCalled();
  });
  it('does not accept a notification association without provider confirmation', async () => {
    const deps = fixtures();
    deps.provider.get.mockResolvedValue({ id: 'call', type: 'webCall', status: 'ended', assistant: { metadata: { ringster_demo_session_id: 'another-session' } } });
    expect((await demoWebhookHandler(deps)(webhookRequest)).statusCode).toBe(503);
    expect(deps.store.apply).not.toHaveBeenCalled();
  });
});
