# Personalised demo foundation

This implements the foundation and server integration for Ringster's first-call
milestone. It is not a customer-visible demo launch. The new endpoints return
404 unless RINGSTER_DEMO_ENABLED is explicitly set to true. With the flag off,
they make no provider or database calls. Current call routing, onboarding and
paid-credit accounting remain unchanged.

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

## Server integration

The second migration adds immutable-per-request business snapshots, an inbox
of notification identifiers, and separately stored demo transcripts. It does
not store raw webhook payloads, provider secrets or room URLs. Final state,
transcript and inbox acknowledgement are committed in one transaction.

The adapter creates a transient assistant through Vapi POST /call with web
transport. It uses the private key only on the server, a 15-second timeout,
and no creation retries. It validates the returned call/session association.
Recovery uses GET /call/{id}. Provider errors never reach the browser verbatim.

POST /.netlify/functions/demo-session accepts either:

- `action: prepare`, `requestId` (UUID), and `business` (businessName,
  businessType, services, serviceArea, hours, agentName).
- `action: recover` and `sessionId` (UUID).

Requests require a Bearer token and an email-verified Supabase account. The
server derives the owner from that token. GET returns remaining allowance and
the owner's session IDs/states. Browser-supplied owners, assistant overrides,
call IDs and arbitrary configuration are rejected.

POST /.netlify/functions/demo-webhook requires the dedicated secret via
Authorization or x-vapi-secret. It persists notification identifiers before
fetching the call from Vapi and cross-checking the assistant's demo session.
Failures return 503 and leave the inbox item pending. Webhook retries or an
owner's recover request replay pending entries. Recovery never creates a call.

If creation timed out and no provider ID or callback has arrived, the session
remains uncertain. The API reports needsReconciliation; it does not refund or
start a replacement based on elapsed time. This version has no scheduled
reconciliation worker or operator UI. Such cases require provider inspection
before any manual service-role intervention.

The configured customer-join-timeout end reason with no transcript can release
an attempt if no connection was recorded. Short or missing durations alone do
not justify a refund. Live staging must confirm those signals against Vapi.

## Staging configuration (do not enable in production yet)

Required server environment variables:

- RINGSTER_DEMO_ENABLED=true (omit to keep disabled).
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for an isolated staging project.
- VAPI_API_KEY for the approved staging provider account.
- RINGSTER_DEMO_WEBHOOK_SECRET, a dedicated random secret.
- RINGSTER_DEMO_WEBHOOK_URL, an HTTPS URL ending in
  /.netlify/functions/demo-webhook on that staging deployment.

Never point the demo webhook at the ordinary paid-call vapi-webhook function.
Both demo migrations must be applied to staging before enabling the flag.
Authenticated preparation will make a chargeable provider call when enabled;
automated tests inject mock HTTP responses instead.

API references checked during implementation:
https://docs.vapi.ai/api-reference/calls/create
https://docs.vapi.ai/api-reference/calls/get
https://docs.vapi.ai/calls/customer-join-timeout

## Required before customer rollout

1. Review and apply the additive migration to an isolated staging database;
   exercise simultaneous requests from independent connections.
2. Validate the server adapters in staging with real Vapi response shapes,
   transient-assistant metadata, join URLs, verified-account auth and ownership.
3. Exercise provider timeouts, missing callbacks, duplicate/late notifications,
   refresh/resume and reconciliation; add operational monitoring and an explicit
   operator recovery procedure for calls whose IDs never reached Ringster.
4. Confirm the stored business snapshot matches the greeting and prompt used
   by the actual provider call. No raw credentials may enter results or logs.
5. Validate connection/final-report evidence and refund classification. An
   unexpected contradictory report must be investigated, not auto-refunded.
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
