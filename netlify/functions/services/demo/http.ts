import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export function matchesDemoSecret(provided: string | undefined, expected: string) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const json = (statusCode: number, value: unknown) => ({
  statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(value),
});

export function demoErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, number> = {
    demo_session_not_found: 404, demo_verified_account_required: 403,
    demo_allowance_exhausted: 429, demo_retry_limit: 429, demo_session_pending: 409,
    demo_request_configuration_mismatch: 409,
  };
  if (Object.hasOwn(known, message)) return json(known[message], { error: message });
  // Never send raw provider bodies, database errors, credentials or room URLs.
  return json(503, { error: 'demo_temporarily_unavailable', retry: 'Check the existing session before starting another call.' });
}
