import { supabase } from '../../integrations/supabase/client';
import { z } from 'zod';

const state = z.enum(['reserved', 'uncertain', 'ready', 'connected', 'completed', 'failed_preconnect']);
export const allowanceSchema = z.object({ remaining: z.number().int().min(0).max(3),
  sessions: z.array(z.object({ id: z.string().uuid(), state })) });
export const sessionSchema = z.object({ sessionId: z.string().uuid(), state,
  webCallUrl: z.string().url().nullable(), result: z.object({ transcript: z.string() }).nullable().optional(),
  needsReconciliation: z.boolean().optional() });
export type Allowance = z.infer<typeof allowanceSchema>;
export type DemoSession = z.infer<typeof sessionSchema>;

export async function demoRequest<T>(schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please sign in again to try your receptionist.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('/.netlify/functions/demo-session', {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: 'Please sign in again to try your receptionist.',
        403: 'Verify your email address, then refresh this page to try your receptionist.',
        404: 'The receptionist demo is not available yet.',
        409: 'An earlier demo is still being checked. Refresh its status before trying again.',
        429: 'Your demo allowance or retry limit has been reached. Please try again later or continue setup.',
      };
      throw new Error(messages[response.status] ?? 'We could not check your demo. Please refresh its status.');
    }
    return schema.parse(await response.json());
  } finally { clearTimeout(timer); }
}

export async function checkMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use a browser with microphone access on a secure connection.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(track => track.stop());
  } catch { throw new Error('Allow microphone access in your browser, then try again. No demo was started.'); }
}
