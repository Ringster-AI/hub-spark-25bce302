# Booking required-fields fix — IMPLEMENTED

## Root cause

Flow test agent's `calendar_tool_ids.version` was `2.0` while code expected a newer schema, so the bumped booking-tool schema was never pushed to Vapi for that agent. The live `book_appointment` tool didn't have `attendee_phone` / `attendee_address` in the right schema, so the LLM sometimes put phone/address into `appointment_type` instead of the dedicated fields, and the backend correctly rejected with `"A phone number is required for this booking."`

## What changed

### `netlify/functions/manage-vapi-assistant.ts`
- New `buildBookingFieldRegistry(calendarBookingConfig)` produces a per-agent list of booking fields (base + phone/address/`custom:*`) marked required or optional. Drives `parameters.properties`, `required`, and the tool description.
- New `computeBookingSignature(registry)` produces a deterministic hash. Stored inside `calendar_tool_ids.signature`.
- `ensureAssistantCalendarTools` now recreates the booking tool when **either** `version` or `signature` drifts — so toggling required fields always rebuilds the Vapi schema, no silent drift.
- `CALENDAR_TOOL_VERSION` bumped `'2.1' → '2.2'` (one-shot self-heal for flow test and any other agent stuck on the old schema).
- `book_appointment` description now lists exactly which fields the agent must collect before calling, derived from the registry.
- `CALENDAR_TOOL_VERSION` bumped again to `'2.3'` to force one more repair sync.
- `book_appointment` now defensively normalizes caller-spoken phone numbers in the Vapi code tool before forwarding to Supabase, including spaced digits, dashes, and phrases like "minus".
- The tool now keeps `appointment_type` as an appointment category only and forwards phone/address through `attendee_phone` / `attendee_address`.

### `supabase/functions/vapi-calendar-api/index.ts`
- Required-field validation moved out of `googleBookAppointment` and into the shared `bookAppointment()` dispatcher.
- Applies to **all** providers (Google, Cal.com, Calendly).
- Validates `custom:*` required fields against `params.custom_fields`.
- Friendlier error messages instructing the agent what to collect.
- Defensive backend normalization added so even stale/mis-shaped Vapi calls can extract a phone number from spoken formats or a combined field like `"6475235895, 70 Williston Crescent"`.

### UI save paths (mirror required/custom fields into `calendar_tools.configuration`)
- `src/components/agents/hooks/useCreateAgent.ts`
- `src/components/agents/EditAgentDialog.tsx`
- `src/components/calendar/hooks/useAgentCalendarData.ts`

## After deploy

Re-save the flow test agent once after the Netlify function update is live. Signature/version mismatch triggers booking-tool recreate with `attendee_phone` + `attendee_address` in `required`. Agents without required fields keep working unchanged. The deployed Supabase edge function also provides a safety net for stale calls by extracting phone/address when Vapi sends them in the wrong argument.
