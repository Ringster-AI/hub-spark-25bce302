
ALTER TABLE public.calendar_bookings
  ADD COLUMN IF NOT EXISTS attendee_phone text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_log_id uuid;

CREATE INDEX IF NOT EXISTS idx_calendar_bookings_reminder_lookup
  ON public.calendar_bookings (booking_status, appointment_datetime)
  WHERE reminder_sent_at IS NULL;
