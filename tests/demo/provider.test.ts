import { describe, expect, it, vi } from 'vitest';
import { VapiDemoProvider } from '../../netlify/functions/services/demo/provider';
import { createDemoAssistant } from '../../netlify/functions/services/demo/config';
import { ConfirmedDemoRejection } from '../../netlify/functions/services/demo/prepare';

const sessionId = '00000000-0000-4000-8000-000000000001';
const assistant = createDemoAssistant({ businessName: 'Maple', businessType: 'Plumber', services: 'Repairs', serviceArea: 'Toronto', hours: '9–5', agentName: 'Sam' },
  { sessionId, webhookUrl: 'https://example.invalid/demo', webhookSecret: 'fixture-secret' });
const call = { id: 'call', type: 'webCall', status: 'queued', webCallUrl: 'https://example.daily.co/room', assistant };

describe('Vapi server adapter', () => {
  it('creates one transient web call with private server authentication and no phone data', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(call));
    const provider = new VapiDemoProvider('fixture-private-key', request);
    expect(await provider.create(assistant)).toEqual({ id: 'call', webCallUrl: call.webCallUrl });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.vapi.ai/call');
    expect(options?.headers).toHaveProperty('Authorization', 'Bearer fixture-private-key');
    expect(JSON.parse(options?.body as string)).toEqual({ transport: { type: 'web' }, assistant });
    expect(options?.redirect).toBe('error');
  });
  it.each([400, 401, 403, 404, 422, 429])('classifies HTTP %s as a confirmed rejection without retries or response leakage', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive-provider-details', { status }));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.toBeInstanceOf(ConfirmedDemoRejection);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503])('retains uncertainty on HTTP %s', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.not.toBeInstanceOf(ConfirmedDemoRejection);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not retry transport failures or malformed successful responses', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.toThrow('timeout');
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValue(Response.json({ id: 'call' }));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects another session and non-HTTPS join URLs', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...call, assistant: { metadata: { ringster_demo_session_id: '00000000-0000-4000-8000-000000000002' } } }));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.toThrow('unexpected session');
    request.mockResolvedValue(Response.json({ ...call, webCallUrl: 'http://example.invalid' }));
    await expect(new VapiDemoProvider('key', request).create(assistant)).rejects.toThrow();
  });
  it('encodes call IDs and does not treat a missing record as a refund', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    await expect(new VapiDemoProvider('key', request).get('a/b')).rejects.toThrow('lookup unavailable');
    expect(request.mock.calls[0][0]).toBe('https://api.vapi.ai/call/a%2Fb');
  });
});
