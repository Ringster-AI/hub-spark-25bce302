import { describe, expect, it, vi } from 'vitest';
import { ConfirmedDemoRejection, prepareDemoCall, type DemoStore } from '../../netlify/functions/services/demo/prepare';

const input = {
  userId: 'verified-user', requestId: 'request', webhookUrl: 'https://example.invalid/demo', webhookSecret: 'test-secret',
  business: { businessName: 'Maple', businessType: 'Plumbing', services: 'Repairs', serviceArea: 'Toronto', hours: '9–5', agentName: 'Sam' },
};
function fixtures() {
  const store = {
    reserve: vi.fn<DemoStore['reserve']>().mockResolvedValue({ id: 'session', state: 'reserved', provider_call_id: null }),
    claimDispatch: vi.fn().mockResolvedValue(true), record: vi.fn().mockResolvedValue(undefined),
  };
  const provider = { create: vi.fn().mockResolvedValue({ id: 'call', webCallUrl: 'https://example.invalid/room' }) };
  return { store, provider };
}

describe('single-dispatch demo setup', () => {
  it('claims capacity before creating and persists the call before releasing the join URL', async () => {
    const dependencies = fixtures();
    const result = await prepareDemoCall(input, dependencies);
    expect(result.state).toBe('ready');
    expect(dependencies.store.record).toHaveBeenCalledWith('session', 'ready', 'call');
    expect(dependencies.store.claimDispatch.mock.invocationCallOrder[0]).toBeLessThan(dependencies.provider.create.mock.invocationCallOrder[0]);
    expect(dependencies.provider.create).toHaveBeenCalledTimes(1);
  });
  it('never dispatches when another worker won the claim', async () => {
    const dependencies = fixtures();
    dependencies.store.claimDispatch.mockResolvedValue(false);
    expect((await prepareDemoCall(input, dependencies)).state).toBe('uncertain');
    expect(dependencies.provider.create).not.toHaveBeenCalled();
  });
  it('does not repeat a request whose provider outcome is uncertain', async () => {
    const dependencies = fixtures();
    dependencies.store.reserve.mockResolvedValue({ id: 'session', state: 'uncertain', provider_call_id: null });
    expect((await prepareDemoCall(input, dependencies)).webCallUrl).toBeNull();
    expect(dependencies.provider.create).not.toHaveBeenCalled();
  });
  it('releases only a confirmed rejection', async () => {
    const dependencies = fixtures();
    dependencies.provider.create.mockRejectedValue(new ConfirmedDemoRejection('rejected'));
    await expect(prepareDemoCall(input, dependencies)).rejects.toThrow('rejected');
    expect(dependencies.store.record).toHaveBeenCalledWith('session', 'failed_preconnect', null, 'provider_rejected_request');
  });
  it.each(['timeout', 'provider 500', 'invalid JSON'])('does not refund or retry an ambiguous %s', async (message) => {
    const dependencies = fixtures();
    dependencies.provider.create.mockRejectedValue(new Error(message));
    await expect(prepareDemoCall(input, dependencies)).rejects.toThrow(message);
    expect(dependencies.provider.create).toHaveBeenCalledTimes(1);
    expect(dependencies.store.record).not.toHaveBeenCalled();
  });
  it('does not release the join URL if storing the provider mapping fails', async () => {
    const dependencies = fixtures();
    dependencies.store.record.mockRejectedValue(new Error('database unavailable'));
    await expect(prepareDemoCall(input, dependencies)).rejects.toThrow('database unavailable');
    expect(dependencies.provider.create).toHaveBeenCalledTimes(1);
  });
  it('validates configuration before consuming capacity', async () => {
    const dependencies = fixtures();
    await expect(prepareDemoCall({ ...input, webhookSecret: '' }, dependencies)).rejects.toThrow();
    expect(dependencies.store.reserve).not.toHaveBeenCalled();
  });
});
