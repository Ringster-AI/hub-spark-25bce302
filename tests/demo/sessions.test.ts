import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

type Session = { id: string; state: string; provider_call_id: string | null; max_duration_seconds: number };
let db: PGlite;
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

async function reserve(user = owner, request = randomUUID()) {
  return (await db.query<Session>('SELECT * FROM reserve_demo_call($1, $2)', [user, request])).rows[0];
}
async function record(id: string, state: string, call: string | null = null, duration: number | null = null, failure: string | null = null) {
  return (await db.query<Session>('SELECT * FROM record_demo_call_state($1, $2, $3, $4, $5)',
    [id, state, call, duration, failure])).rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  // Minimal Supabase auth boundary; application SQL is executed unchanged.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261013010000_demo_call_sessions.sql', import.meta.url), 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE demo_call_sessions; DELETE FROM auth.users;');
  await db.query('INSERT INTO auth.users VALUES ($1, now()), ($2, now())', [owner, other]);
});
afterAll(async () => { await db?.close(); });

describe('demo allowance enforced by PostgreSQL', () => {
  it('requires an email-verified existing account', async () => {
    await db.query('UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1', [owner]);
    await expect(reserve()).rejects.toThrow('demo_verified_account_required');
    await expect(reserve(randomUUID())).rejects.toThrow('demo_verified_account_required');
  });

  it('reuses the same request and blocks a second pending session', async () => {
    const request = randomUUID();
    const a = await reserve(owner, request);
    expect(a.max_duration_seconds).toBe(120);
    expect((await reserve(owner, request)).id).toBe(a.id);
    await expect(reserve()).rejects.toThrow('demo_session_pending');
    expect((await reserve(other)).id).not.toBe(a.id);
  });

  it('allows three completed calls and rejects a fourth', async () => {
    for (let i = 0; i < 3; i++) {
      const session = await reserve();
      await record(session.id, 'completed', `call-${i}`, 120);
    }
    await expect(reserve()).rejects.toThrow('demo_allowance_exhausted');
  });

  it('holds uncertain outcomes even after the nominal duration passes', async () => {
    const session = await reserve();
    await record(session.id, 'uncertain');
    await db.query("UPDATE demo_call_sessions SET created_at = now() - interval '1 day' WHERE id = $1", [session.id]);
    await expect(reserve()).rejects.toThrow('demo_session_pending');
    await record(session.id, 'completed', 'reconciled-call', 80);
    expect((await reserve()).state).toBe('reserved');
  });

  it('grants only one provider dispatch claim for a reservation', async () => {
    const session = await reserve();
    const claim = () => db.query<{ claimed: boolean }>('SELECT claim_demo_call_dispatch($1) AS claimed', [session.id]);
    expect((await claim()).rows[0].claimed).toBe(true);
    expect((await claim()).rows[0].claimed).toBe(false);
    await expect(reserve()).rejects.toThrow('demo_session_pending');
  });

  it('releases confirmed pre-conversation failures without resetting the original request', async () => {
    const request = randomUUID();
    const session = await reserve(owner, request);
    await expect(record(session.id, 'failed_preconnect')).rejects.toThrow('demo_failure_evidence_required');
    await record(session.id, 'failed_preconnect', null, 0, 'provider_rejected_request');
    expect((await reserve(owner, request)).state).toBe('failed_preconnect');
    expect((await reserve()).state).toBe('reserved');
  });

  it('never refunds a call that connected', async () => {
    const session = await reserve();
    await record(session.id, 'connected', 'connected-call');
    await expect(record(session.id, 'failed_preconnect', 'connected-call', 0, 'client_disconnected'))
      .rejects.toThrow('demo_connected_attempt_not_refundable');
    await expect(record(session.id, 'completed', 'different-call', 10)).rejects.toThrow('demo_provider_call_mismatch');
  });

  it('requires a provider mapping and preserves terminal states under duplicate/out-of-order events', async () => {
    const session = await reserve();
    await expect(record(session.id, 'ready')).rejects.toThrow('demo_provider_call_required');
    await record(session.id, 'connected', 'call');
    expect((await record(session.id, 'ready', 'call')).state).toBe('connected');
    await record(session.id, 'completed', 'call', 42);
    expect((await record(session.id, 'completed', 'call', 42)).state).toBe('completed');
    expect((await record(session.id, 'connected', 'call')).state).toBe('completed');
    await expect(record(session.id, 'failed_preconnect', 'call', 0, 'late-failure'))
      .rejects.toThrow('demo_conflicting_terminal_evidence');
    expect((await db.query('SELECT * FROM demo_call_sessions')).rows).toHaveLength(1);
  });

  it('limits repeated failed setup attempts independently of the free call allowance', async () => {
    for (let i = 0; i < 10; i++) {
      const session = await reserve();
      await record(session.id, 'failed_preconnect', null, 0, 'provider_rejected_request');
    }
    await expect(reserve()).rejects.toThrow('demo_retry_limit');
  });

  it('enforces ownership and rejects client-side mutation or quota reservation', async () => {
    await reserve();
    await reserve(other);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await db.exec('SET ROLE authenticated');
    const rows = await db.query<{ user_id: string }>('SELECT user_id FROM demo_call_sessions');
    expect(rows.rows).toEqual([{ user_id: owner }]);
    await expect(reserve()).rejects.toThrow('permission denied');
    await expect(db.exec("UPDATE demo_call_sessions SET state = 'failed_preconnect'"))
      .rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(db.exec('SELECT * FROM demo_call_sessions')).rejects.toThrow('permission denied');
  });

  it('allows trusted service operations and has a database constraint against two pending sessions', async () => {
    await db.exec('SET ROLE service_role');
    await reserve();
    await expect(db.query('INSERT INTO demo_call_sessions (user_id, request_id) VALUES ($1, $2)', [owner, randomUUID()]))
      .rejects.toThrow('demo_call_sessions_one_pending_idx');
  });
});
