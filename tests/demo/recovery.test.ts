import { describe, expect, it } from 'vitest';
import { classifyDemoCall } from '../../netlify/functions/services/demo/recovery';
import type { ProviderCall } from '../../netlify/functions/services/demo/provider';
import type { DemoSession } from '../../netlify/functions/services/demo/prepare';

const session: DemoSession = { id: 'session', state: 'uncertain', provider_call_id: null };
const call: ProviderCall = { id: 'call', type: 'webCall', status: 'ended',
  assistant: { metadata: { ringster_demo_session_id: 'session' } },
  startedAt: '2026-10-13T12:00:00Z', endedAt: '2026-10-13T12:01:00Z', artifact: { transcript: 'Customer: My sink leaks.' } };

describe('authoritative demo recovery', () => {
  it('recovers a completed call whose creation response was lost', () => {
    expect(classifyDemoCall(session, call)).toEqual({ state: 'completed', duration: 60, failure: null, transcript: 'Customer: My sink leaks.' });
  });
  it('rejects mismatched provider/session ownership', () => {
    expect(() => classifyDemoCall({ ...session, id: 'other' }, call)).toThrow('ownership mismatch');
    expect(() => classifyDemoCall({ ...session, provider_call_id: 'other' }, call)).toThrow('ownership mismatch');
  });
  it('releases only a verified customer-join failure with no conversation evidence', () => {
    const failure = { ...call, artifact: {}, endedReason: 'assistant-did-not-receive-customer-audio' };
    expect(classifyDemoCall(session, failure)?.state).toBe('failed_preconnect');
    expect(classifyDemoCall({ ...session, state: 'connected' }, failure)?.state).toBe('completed');
    expect(classifyDemoCall(session, { ...failure, artifact: call.artifact })?.state).toBe('completed');
  });
  it('does not infer a refund from zero duration or unknown status', () => {
    expect(classifyDemoCall(session, { ...call, startedAt: null, endedAt: null })?.state).toBe('completed');
    expect(classifyDemoCall(session, { ...call, status: 'not-found' })).toBeNull();
  });
});
