import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { demoBusinessSchema, type DemoBusiness } from './config';
import type { DemoStore } from './prepare';
import type { DemoEvidence } from './recovery';

export const sessionSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(),
  state: z.enum(['reserved', 'uncertain', 'ready', 'connected', 'completed', 'failed_preconnect']),
  provider_call_id: z.string().nullable(),
  business_snapshot: demoBusinessSchema.nullable(),
});
export type StoredDemoSession = z.infer<typeof sessionSchema>;

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function row(data: unknown) { return sessionSchema.parse(Array.isArray(data) ? data[0] : data); }

export class SupabaseDemoStore implements DemoStore {
  constructor(private readonly db: SupabaseClient) {}
  async reserve(userId: string, requestId: string, business: DemoBusiness) {
    return row(checked(await this.db.rpc('reserve_demo_call_with_business', {
      p_user_id: userId, p_request_id: requestId, p_business: demoBusinessSchema.parse(business),
    })));
  }
  async claimDispatch(sessionId: string) {
    return z.boolean().parse(checked(await this.db.rpc('claim_demo_call_dispatch', { p_session_id: sessionId })));
  }
  async record(sessionId: string, state: 'ready' | 'failed_preconnect', callId: string | null, failure?: string) {
    return row(checked(await this.db.rpc('record_demo_call_state', {
      p_session_id: sessionId, p_state: state, p_provider_call_id: callId, p_failure_code: failure ?? null,
    })));
  }
  async ownedSession(userId: string, sessionId: string) {
    const data = checked(await this.db.from('demo_call_sessions').select('*')
      .eq('id', sessionId).eq('user_id', userId).maybeSingle());
    if (!data) throw new Error('demo_session_not_found');
    return row(data);
  }
  async session(sessionId: string) {
    const data = checked(await this.db.from('demo_call_sessions').select('*').eq('id', sessionId).maybeSingle());
    if (!data) throw new Error('demo_session_not_found');
    return row(data);
  }
  async list(userId: string) {
    const data = checked(await this.db.from('demo_call_sessions').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }));
    return z.array(sessionSchema).parse(data);
  }
  async enqueue(eventKey: string, sessionId: string, callId: string) {
    checked(await this.db.from('demo_call_inbox').upsert({
      event_key: eventKey, session_id: sessionId, provider_call_id: callId,
    }, { onConflict: 'event_key', ignoreDuplicates: true }));
    const data = checked(await this.db.from('demo_call_inbox').select('id,processed_at,session_id,provider_call_id')
      .eq('event_key', eventKey).single());
    return z.object({ id: z.string().uuid(), processed_at: z.string().nullable(),
      session_id: z.string().uuid(), provider_call_id: z.string() }).parse(data);
  }
  async apply(eventId: string, evidence: DemoEvidence) {
    return row(checked(await this.db.rpc('apply_demo_call_evidence', {
      p_event_id: eventId, p_state: evidence.state, p_duration: evidence.duration,
      p_failure: evidence.failure, p_transcript: evidence.transcript,
    })));
  }
  async result(sessionId: string) {
    const data = checked(await this.db.from('demo_call_results').select('transcript').eq('session_id', sessionId).maybeSingle());
    return z.object({ transcript: z.string().nullable() }).nullable().parse(data);
  }
  async pendingEvents(sessionId: string) {
    const data = checked(await this.db.from('demo_call_inbox').select('event_key,provider_call_id')
      .eq('session_id', sessionId).is('processed_at', null).order('received_at').limit(10));
    return z.array(z.object({ event_key: z.string(), provider_call_id: z.string() })).parse(data);
  }
}
