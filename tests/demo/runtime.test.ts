import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoRuntime } from '../../netlify/functions/services/demo/runtime';
import { matchesDemoSecret } from '../../netlify/functions/services/demo/http';

afterEach(() => vi.unstubAllEnvs());
describe('server demo configuration', () => {
  it('fails closed if provider or webhook configuration is missing', () => {
    vi.stubEnv('VAPI_API_KEY', '');
    expect(() => demoRuntime()).toThrow('configuration incomplete');
  });
  it('rejects ordinary production webhooks instead of routing demo calls into paid credits', () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    vi.stubEnv('VAPI_API_KEY', 'test');
    vi.stubEnv('RINGSTER_DEMO_WEBHOOK_SECRET', 'test');
    vi.stubEnv('RINGSTER_DEMO_WEBHOOK_URL', 'https://example.invalid/functions/v1/vapi-webhook');
    expect(() => demoRuntime()).toThrow('dedicated HTTPS demo webhook');
  });
  it('requires a nonempty matching webhook secret', () => {
    expect(matchesDemoSecret(undefined, 'expected')).toBe(false);
    expect(matchesDemoSecret('', '')).toBe(false);
    expect(matchesDemoSecret('wrong', 'expected')).toBe(false);
    expect(matchesDemoSecret('expected', 'expected')).toBe(true);
  });
});
