/**
 * Per-function authentication policy for the self-hosted edge runtime.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * The policy is the security boundary of every edge function, so it needs
 * to be unit-testable without booting the runtime. The Deno edge function
 * tests in this repo run with `--allow-none` (no runtime permissions), and
 * `Deno.serve` cannot be exercised in a unit test. Keeping the decision
 * logic in a pure module lets it be tested directly.
 *
 * WHY A POLICY IS NEEDED AT ALL
 * -----------------------------
 * On Supabase Cloud, the gateway honours a per-function `verify_jwt`
 * setting in `config.toml`. The self-hosted edge runtime does NOT: it has
 * no JWT verification code at all, and `VERIFY_JWT` is a single global
 * switch.
 *
 *   - `VERIFY_JWT=true`  -> EVERY function demands a JWT, which breaks
 *     third-party webhooks, OAuth redirects and server-to-server cron jobs.
 *   - `VERIFY_JWT=false` -> NO function demands a JWT, and the only thing
 *     protecting a function is whatever auth the function implements
 *     itself. A function that forgets to check anything is wide open.
 *
 * Neither setting expresses "webhooks stay public, everything else needs a
 * JWT". So the policy is implemented here, in the dispatcher, and the
 * dispatcher is the only thing standing between the public internet and
 * the functions.
 */

/**
 * Functions whose callers cannot present a user JWT.
 *
 * Each entry is a deliberate decision, and a function listed here is
 * RESPONSIBLE FOR ITS OWN AUTH (shared-secret header, provider webhook
 * signature, or rate limiting). Grouping them by reason makes it obvious
 * why each one is open, and makes it obvious when a new one is needed.
 */
export const PUBLIC_FUNCTIONS: ReadonlySet<string> = new Set([
  // --- pg_cron targets (the database posts server-to-server) ---
  'process-campaigns',
  'email-lifecycle-cron',
  'process-booking-reminders',

  // --- GoTrue send-email hook (called with a webhook signature) ---
  'auth-email-hook',

  // --- third-party webhooks (the provider posts, it cannot hold a JWT) ---
  'stripe-webhook',
  'calendly-webhook',
  'calcom-webhook',
  'vapi-webhook',

  // --- OAuth redirects (the browser lands there with no auth header) ---
  'google-callback',
  'microsoft-callback',

  // --- server-to-server integrations ---
  'vapi-calendar-api',
  'vapi-calendar-tool',
  'vapi-sms-tool',
  'register-vapi-calendar-tools',
  'store-google-tokens',
  'revoke-microsoft-tokens',
  'connect-google',
  'connect-microsoft',
  'connect-calendly',
  'calendly-callback',
  'backfill-vapi-server-secret',

  // --- public forms / landing pages (no session) ---
  'partner-demos',
  'send-partner-invite',
  'add-to-waitlist',
  'forward-demo-request',
  'try-ringster-call',
  'send-feedback',
  'handle-email-unsubscribe',
  'preview-transactional-email',
  'handle-email-suppression',
]);

/**
 * Resolve the target function name from a request path.
 *
 * The runtime routes `/functions/v1/<name>` to this dispatcher, so the
 * function name is the first path segment after the mount prefix. The
 * mount prefix is configurable, so rather than hard-coding it we take the
 * segment that follows the last `/v1` marker when present, and otherwise
 * fall back to the first segment.
 *
 * Returns null when the path does not name a function.
 */
export function resolveFunctionName(pathname: string): string | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  const v1Index = segments.lastIndexOf('v1');
  if (v1Index !== -1) {
    // "v1" is the mount point. If it is the last segment there is no
    // function name, and falling through to the first-segment default
    // would resolve to the mount prefix itself (e.g. "functions").
    if (v1Index + 1 >= segments.length) return null;
    return segments[v1Index + 1];
  }

  return segments[0];
}

/**
 * Decide whether a request to `functionName` must carry a valid JWT.
 *
 * `verifyJwt` reflects the global `VERIFY_JWT` switch. When it is off,
 * nothing is enforced, because turning it on globally would break the
 * public functions listed above.
 */
export function requiresJwt(
  functionName: string,
  verifyJwt: boolean,
): boolean {
  if (!verifyJwt) return false;
  return !PUBLIC_FUNCTIONS.has(functionName);
}

/**
 * Whether a request method bypasses the auth check.
 *
 * CORS preflight requests carry no credentials by design, so they are
 * never subject to the JWT check. Blocking them would break every
 * browser call from a cross-origin page.
 */
export function isPreflight(method: string): boolean {
  return method.toUpperCase() === 'OPTIONS';
}
