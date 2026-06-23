// Sends 24h-before reminders (email + SMS) for upcoming confirmed bookings.
// Triggered by pg_cron every 15 minutes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendTwilioSms, formatBookingTime } from '../_shared/booking-notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Window: appointments starting between 23h and 25h from now (1h slack for cron drift).
  const now = Date.now()
  const lowerIso = new Date(now + 23 * 60 * 60 * 1000).toISOString()
  const upperIso = new Date(now + 25 * 60 * 60 * 1000).toISOString()

  const { data: bookings, error } = await supabase
    .from('calendar_bookings')
    .select('id, appointment_datetime, duration_minutes, attendee_name, attendee_email, attendee_phone, appointment_type, metadata')
    .eq('booking_status', 'confirmed')
    .is('reminder_sent_at', null)
    .gte('appointment_datetime', lowerIso)
    .lt('appointment_datetime', upperIso)
    .limit(500)

  if (error) {
    console.error('Reminder query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  for (const booking of bookings || []) {
    const tz = (booking.metadata as any)?.timezone || 'America/New_York'
    const { combined } = formatBookingTime(booking.appointment_datetime, tz)
    const title = booking.appointment_type || 'Appointment'

    try {
      if (booking.attendee_email) {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'booking-reminder',
            recipientEmail: booking.attendee_email,
            idempotencyKey: `booking-reminder-${booking.id}`,
            templateData: {
              name: booking.attendee_name || undefined,
              bookingTitle: title,
              startTime: combined,
              timezone: tz,
              hoursUntil: 24,
            },
          },
        })
      }

      if (booking.attendee_phone) {
        await sendTwilioSms(
          booking.attendee_phone,
          `Reminder: your ${title} is tomorrow at ${combined} ${tz}. Reply to reschedule.`,
        )
      }

      await supabase
        .from('calendar_bookings')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', booking.id)

      sent += 1
    } catch (e) {
      console.error(`Reminder failed for booking ${booking.id}:`, e)
    }
  }

  return new Response(JSON.stringify({ scanned: bookings?.length || 0, sent }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
