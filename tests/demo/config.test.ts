import { describe, expect, it } from 'vitest';
import { createDemoAssistant } from '../../netlify/functions/services/demo/config';

const business = {
  businessName: 'Maple Plumbing', businessType: 'Plumber', services: 'Repairs and installations',
  serviceArea: 'Toronto', hours: 'Weekdays 8am–5pm', agentName: 'Sam',
};
const options = { sessionId: 'demo-123', webhookUrl: 'https://example.invalid/demo-webhook', webhookSecret: 'test-secret' };

describe('isolated demonstration assistant', () => {
  it('personalises the greeting and caps provider duration without any live tools', () => {
    const config = createDemoAssistant(business, options);
    expect(config.firstMessage).toContain('Maple Plumbing');
    expect(config.maxDurationSeconds).toBe(120);
    expect(config.model).not.toHaveProperty('tools');
    expect(config.model).not.toHaveProperty('toolIds');
    expect(config).not.toHaveProperty('phoneNumberId');
    expect(config).not.toHaveProperty('transferDestinations');
    expect(config.server.url).toBe(options.webhookUrl);
    expect(config.metadata).toEqual({ ringster_demo_session_id: 'demo-123' });
  });
  it('rejects extra production configuration and excessive input', () => {
    expect(() => createDemoAssistant({ ...business, toolIds: ['production-tool'] } as typeof business, options)).toThrow();
    expect(() => createDemoAssistant({ ...business, services: 'x'.repeat(1001) }, options)).toThrow();
    expect(() => createDemoAssistant({ ...business, businessName: '  ' }, options)).toThrow();
  });
  it('fails closed without webhook authentication or HTTPS', () => {
    expect(() => createDemoAssistant(business, { ...options, webhookSecret: '' })).toThrow();
    expect(() => createDemoAssistant(business, { ...options, webhookUrl: 'http://example.invalid' })).toThrow();
  });
});
