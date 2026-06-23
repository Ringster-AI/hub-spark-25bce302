## Goal

When the AI books an appointment, capture rich context from the call into the booking's notes field, notify the agent owner (email + SMS), send the attendee a branded confirmation, and follow up with a 24h reminder (email + SMS).

## Part 1 — Richer booking notes

Today the `notes` column on `calendar_bookings` is just "Booked via Ringster AI agent". Replace that with a structured block written by the booking pipeline:

```
Booked via Ringster AI agent

Caller: {attendee_name} ({attendee_phone})
Reason: {appointment_type}

Summary:
{ai_call_summary}

Call: https://ringster.ai/dashboard/recordings/{call_log_id}
```

Implementation:
- In `supabase/functions/vapi-calendar-api/index.ts`, when handling the `book_appointment` tool call, look up the originating `call_logs` row via the Vapi `callId` already passed through, and pull `summary`, `attendee_phone`, plus the recording id.
- If summary isn't ready yet (Vapi posts it slightly after end-of-call), insert the booking with what's available and rely on the existing `vapi-call-events` / `get-vapi-call-data` flow to patch `notes` after the call summary lands.
- Keep the literal first line "Booked via Ringster AI agent" so existing UI/filters that look for it still match.

## Part 2 — Owner notification (email + SMS)

On every successful booking insert, fan out two messages to the agent owner (the `user_id` on `agent_configs`):

1. **Email to owner** — new app email template `booking-owner-notification.tsx` using the existing booking-confirmation brand styles. Includes attendee name/phone/email, appointment time + timezone, agent name, full notes block, and a deep link to the booking in the dashboard. Sent via the existing `send-transactional-email` queue.
2. **SMS to owner** — Twilio SMS from the fixed `+1-620-445-8363` Ringster number to the owner's phone (from `profiles.phone_number`). Short format:
   ```
   Ringster: New booking — {attendee_name} on {date} {time} {tz}. Details: {short_link}
   ```
   Sent through a new `netlify/functions/send-owner-sms.ts` wrapper around the existing Twilio service. Skip silently if the owner has no phone number on file (and log a one-time toast hint in the dashboard later).

Owner notifications must respect a per-agent toggle (`agent_configs.notify_owner_on_booking`, default true) so power users can mute when they don't want the noise.

## Part 3 — Attendee follow-ups

1. **Confirmation (immediate)** — reuse the existing `booking-confirmation.tsx` email template. Already wired; just ensure it fires on insert with the enriched data. If `attendee_phone` is present, also send a short Twilio SMS confirmation.
2. **24h reminder** — schedule via a new Supabase pg_cron job `process-booking-reminders` running every 15 minutes:
   - Selects `calendar_bookings` where `appointment_datetime` is 23–24h away, `booking_status = 'confirmed'`, and `reminder_sent_at IS NULL`.
   - Sends email (`booking-reminder.tsx`, new template) + SMS (if phone present).
   - Stamps `reminder_sent_at` to prevent double-sends.

## Part 4 — Schema changes

One migration:
- `ALTER TABLE calendar_bookings ADD COLUMN reminder_sent_at timestamptz`
- `ALTER TABLE calendar_bookings ADD COLUMN attendee_phone text` (so we can SMS the attendee without joining call_logs every time)
- `ALTER TABLE agent_configs ADD COLUMN notify_owner_on_booking boolean DEFAULT true`
- Index on `(booking_status, appointment_datetime)` for the reminder cron query.

## Part 5 — UI

- `CalendarBookings.tsx`: render the new structured notes with preserved line breaks, show attendee phone, and add a "Call summary" expander when present.
- Agent edit dialog: add a "Notify me on new bookings" toggle bound to `notify_owner_on_booking`.

## Technical / files touched

- `supabase/functions/vapi-calendar-api/index.ts` — enrich notes, store `attendee_phone`, trigger owner + attendee notifications.
- `supabase/functions/_shared/transactional-email-templates/` — add `booking-owner-notification.tsx` and `booking-reminder.tsx`, update `registry.ts`.
- `supabase/functions/process-booking-reminders/index.ts` — new cron-driven function.
- `netlify/functions/send-owner-sms.ts` — Twilio SMS wrapper (owner + attendee).
- Migration for the three new columns + index.
- pg_cron schedule for `process-booking-reminders` every 15 min.
- Frontend: `src/components/campaigns/CalendarBookings.tsx`, `src/components/agents/EditAgentDialog.tsx`.

## Prerequisites

Email infrastructure must be set up (Lovable Emails). I'll check `email_domain--check_email_domain_status` first and run setup if it's not configured before scaffolding the two new app email templates.

## Out of scope

- Post-call thank-you sequence (you chose confirmation + 24h reminder only).
- Calendar invite (.ics) attachments — Google Calendar event already delivers the native invite to the attendee.
- Owner-side in-app notification center (can be a follow-up).