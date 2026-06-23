## What's actually broken

Calendar booking works fine when no required fields are selected. The break only happens when an agent enables `phone` or `address` as required booking info. Root cause is a mismatch between three places:

- `agent_configs.config.calendar_booking.required_fields` — what the UI saves (has `["phone","address"]` for flow test).
- The Vapi `book_appointment` tool schema attached to the assistant — should mark `attendee_phone` / `attendee_address` as `required`.
- `vapi-calendar-api` Google booking handler — already validates required fields and returns `"A phone number is required for this booking."`

The flow test agent's DB row still shows `calendar_tool_ids.version = 2.0` even though current code is `2.1`. So the bumped version never actually ran for this agent (most recent save attempt likely failed before the booking-tool recreate path, or the agent was last saved before the bump deployed). Result: assistant still uses the old `book_appointment` schema where `attendee_phone` isn't required, the LLM calls `book_appointment` without it, and the backend correctly rejects the booking.

Also: only the Google booking path validates required fields — Cal.com and Calendly would silently ignore them.

## Repair plan

### 1. Extensible booking-tool schema (per agent)

In `netlify/functions/manage-vapi-assistant.ts`, replace the hard-coded required-fields branching with a small registry built from the agent's `calendar_booking` config:

```ts
type BookingField = {
  key: string;              // 'attendee_phone' | 'attendee_address' | `custom_${name}`
  schema: { type, description };
  required: boolean;
  customName?: string;      // for custom:* fields
};
```

`buildBookingFieldRegistry(calendarBookingConfig)` returns the list (always includes datetime/name/email as required base fields, adds phone/address/custom:* based on `required_fields` and `custom_fields`). `buildAssistantCalendarTools` then derives `parameters.properties` + `required` + the tool `description` from the registry instead of inline `if (configuredRequiredFields.includes(...))`.

This makes adding new built-in or custom required fields a one-line change and keeps schema, description, and prompt in sync.

### 2. Schema-signature based recreate (no more silent version drift)

Add a `calendar_tool_signature` hash derived from `{ version, requiredFields, customFields }` and store it inside `calendar_tool_ids`. In `ensureAssistantCalendarTools`, recreate the booking tool whenever the stored signature differs from the computed one (not only on global version bump). This guarantees that toggling `phone` from off→on instantly rebuilds the Vapi tool schema with `attendee_phone` required — the failure mode the flow test agent hit can't recur.

### 3. One-shot self-heal for the flow test agent

Bump `CALENDAR_TOOL_VERSION` to `'2.2'` so the very next save of any agent (including flow test) deletes+recreates `book_appointment` with the corrected schema. Combined with the signature check above, even later required-field changes will trigger a rebuild.

### 4. Centralize required-field validation in `vapi-calendar-api`

Move the required-field check out of `googleBookAppointment` into the shared `bookAppointment(supabase, params)` dispatcher (before provider switch). Apply identical validation for Google, Cal.com, and Calendly. Validate `custom_fields` keys too. Keep the existing user-facing messages.

### 5. Persist required/custom fields consistently in `calendar_tools.configuration`

`useCreateAgent`, `EditAgentDialog`, and `useAgentCalendarData` currently drop `required_fields` and `custom_fields` when writing `calendar_tools.configuration`. Add them so non-Vapi consumers (admin views, future provider handlers) can read the same source of truth. Source of truth for the Vapi sync stays `agent_configs.config.calendar_booking`, but mirroring keeps the two rows consistent.

### 6. Tool registry pattern for future tools

Refactor `manage-vapi-assistant.ts` update path so each tool provider (transfer, calendar, future custom tools) exposes the same shape:

```ts
interface ToolProvider {
  isEnabled(agent): boolean;
  syncTools(ctx): Promise<{ toolIds: string[]; configPatch: Record<string, unknown> }>;
}
```

The assistant PATCH then attaches `flatten(providers.map(p => p.toolIds))`. Adding a new tool no longer risks overwriting an existing provider's IDs.

### 7. UI feedback

Keep current create/update loading states. Surface a clearer toast when `bookingToolError` is set, explicitly mentioning required-field mismatch so users know to re-save.

## After deploy

Re-save the flow test agent once. The signature change + version bump deletes the stale `book_appointment` tool, the new one has `attendee_phone` / `attendee_address` in `required`, the LLM collects them before calling, and the backend validation passes. Agents with no required fields keep working exactly as they do today.

## Files touched

- `netlify/functions/manage-vapi-assistant.ts` (registry, signature, version bump, provider pattern)
- `supabase/functions/vapi-calendar-api/index.ts` (centralized required-field validation across providers)
- `src/components/agents/hooks/useCreateAgent.ts`
- `src/components/agents/EditAgentDialog.tsx`
- `src/components/calendar/hooks/useAgentCalendarData.ts`
- Optionally `netlify/functions/services/vapi-config.ts` — already good; minor cleanup if needed