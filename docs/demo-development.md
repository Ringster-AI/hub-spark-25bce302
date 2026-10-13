# Personalised demo foundation

This change is the first implementation slice of Ringster's first-call milestone.
It is not a customer-visible demo launch. It makes no provider calls and does not
change current call routing, onboarding, or paid-credit accounting.

## Included

- An additive `demo_call_sessions` migration with verified-email eligibility,
  three reserved/connected/completed attempts per account, one pending session,
  and a fixed 120-second duration policy.
- Account locking, a unique active-session constraint, idempotent request IDs,
  and a single-dispatch claim committed before a provider request.
- State transitions which retain uncertain outcomes, reject refunds after a
  connection, and ignore duplicate/delayed events without reopening sessions.
- Owner-only reads; reservation and mutation are restricted to the service role.
- Ten setup attempts per rolling 24 hours as a separate operational retry limit.
  Confirmed pre-connection failures release the three-call allowance slot.
- Explicitly constructed Vapi demonstration configuration with no production
  transfer/booking tools, a 120-second provider cap, and a separate webhook URL.
- A dependency-injected setup coordinator which never automatically retries
  creation or releases a room URL before recording the provider binding.
- PR tests, scoped lint/type checks, and a production build with placeholder
  configuration. Existing repository-wide lint debt is not claimed to pass.

## Verification

Run `npm ci --legacy-peer-deps`, `npm test`,
`npx tsc -p tsconfig.demo.json`, and
`npx eslint netlify/functions/services/demo tests/demo vitest.config.ts`.

Database tests execute the migration unchanged in PGlite with minimal Supabase
auth stubs. They cover SQL permissions, row visibility, reservations, dispatch
claims, terminal states, and quotas. PGlite serializes queries: these tests do
not replace a staging test with multiple PostgreSQL connections.

Tests use a separate Vitest configuration to avoid loading the application
plugin or the root production environment. No live Vapi/Twilio credentials or
production database are needed.

## Required before exposing an endpoint or UI

1. Review and apply the additive migration to an isolated staging database;
   exercise simultaneous requests from independent connections.
2. Implement an authenticated server adapter for DemoStore. Derive the owner
   from verified auth, never a submitted user ID. Do not expose the state
   mutation or dispatch functions to browsers.
3. Implement and validate a single-request Vapi web-call adapter against the
   current API. Only definitive rejection responses may be classified as
   ConfirmedDemoRejection. Timeouts, malformed responses and 5xx errors must
   retain the reservation. Do not pass private credentials to the browser.
4. Persist immutable business/configuration snapshots and authenticated webhook
   reports. Resolve provider/session ownership, recover unknown outcomes, and
   provide a resume path for an existing room. The coordinator intentionally
   does not re-create existing sessions or return cached room credentials.
5. Map authoritative connection/final-report evidence to database transitions.
   Persist reports before acknowledging them. A browser error cannot refund an
   attempt. Unexpected contradictory final reports require investigation.
6. Confirm the provider actually enforces maxDurationSeconds. The database
   stores policy and usage evidence; it cannot stop a remote call itself.
7. Build browser start/end/recovery controls, visible remaining allowance,
   transcript-backed results, and activation entry. Test microphone denial,
   disconnect, refresh, slow reports, and end-of-call cleanup.
8. Keep demos out of ordinary call_logs, credit deductions, lead creation,
   real appointments, transfers and notifications. Enforce quotas on the
   server even if a browser is modified; do not implement demos merely by
   calling the existing public-key button.

No deployment, migration execution, provider spend or recurring automation is
part of this foundation change.
