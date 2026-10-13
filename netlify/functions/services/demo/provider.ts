import { z } from 'zod';
import { ConfirmedDemoRejection, type DemoProvider } from './prepare';
import type { createDemoAssistant } from './config';

const httpsUrl = z.string().url().refine(value => new URL(value).protocol === 'https:');
export const providerCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('webCall'),
  status: z.string(),
  webCallUrl: httpsUrl.optional(),
  transport: z.object({ callUrl: httpsUrl.optional() }).passthrough().optional(),
  assistant: z.object({ metadata: z.object({ ringster_demo_session_id: z.string().uuid() }).passthrough() }).passthrough(),
  startedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  endedReason: z.string().optional(),
  artifact: z.object({ transcript: z.string().max(100000).optional() }).passthrough().optional(),
  transcript: z.string().max(100000).optional(),
}).passthrough();
export type ProviderCall = z.infer<typeof providerCallSchema>;

export class VapiDemoProvider implements DemoProvider {
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error('Demo Vapi configuration missing');
  }
  async create(assistant: ReturnType<typeof createDemoAssistant>) {
    // No retry: a timed-out POST may already have created a chargeable call.
    const response = await this.request('https://api.vapi.ai/call', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transport: { type: 'web' }, assistant }),
    });
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
      throw new ConfirmedDemoRejection(`Demo provider rejected request (${response.status})`);
    }
    if (!response.ok) throw new Error(`Demo provider outcome uncertain (${response.status})`);
    const call = providerCallSchema.parse(await response.json());
    if (call.assistant.metadata.ringster_demo_session_id !== assistant.metadata.ringster_demo_session_id) {
      throw new Error('Demo provider returned an unexpected session');
    }
    const webCallUrl = call.webCallUrl ?? call.transport?.callUrl;
    if (!webCallUrl) throw new Error('Demo provider returned no join URL');
    return { id: call.id, webCallUrl };
  }
  async get(callId: string): Promise<ProviderCall> {
    if (!callId.trim()) throw new Error('Demo call ID missing');
    const response = await this.request(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    // A missing or unavailable record is not evidence that creation failed.
    if (!response.ok) throw new Error(`Demo lookup unavailable (${response.status})`);
    const call = providerCallSchema.parse(await response.json());
    if (call.id !== callId) throw new Error('Demo provider returned an unexpected call');
    return call;
  }
}
