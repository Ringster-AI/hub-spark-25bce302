// Shared helpers for sending booking-related notifications (SMS via Twilio + email via send-transactional-email).
// Imported from the calendar booking and reminder edge functions.

const RINGSTER_OUTBOUND_NUMBER = '+16204458363'

export interface BookingNotificationContext {
  supabase: any
  bookingId: string
  appointmentDatetime: string
  durationMinutes?: number | null
  timezone: string
  attendeeName?: string | null
  attendeeEmail?: string | null
  attendeePhone?: string | null
  appointmentType?: string | null
  agentId: string
  agentName?: string | null
  ownerUserId: string
  callSummary?: string | null
  callLogId?: string | null
}

export function formatBookingTime(isoLikeDatetime: string, tz: string): { date: string; time: string; combined: string } {
  // appointment_datetime is naive local in agent's tz; treat as such for display.
  const raw = isoLikeDatetime.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
  const [datePart, timePart = '12:00:00'] = raw.split('T')
  const [hh, mm] = timePart.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const displayHour = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh)
  const time = `${displayHour}:${String(mm).padStart(2, '0')} ${ampm}`
  const date = new Date(`${datePart}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  return { date, time, combined: `${date} at ${time}` }
}

export async function sendTwilioSms(toE164: string, body: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!sid || !token) {
    console.warn('Twilio credentials not configured; skipping SMS to', toE164)
    return
  }
  const auth = btoa(`${sid}:${token}`)
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: toE164,
      From: RINGSTER_OUTBOUND_NUMBER,
      Body: body.slice(0, 600),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`Twilio SMS failed (${res.status}) to ${toE164}: ${text}`)
  }
}

export function buildOwnerNotesBlock(ctx: BookingNotificationContext): string {
  const lines = ['Booked via Ringster AI agent', '']
  const callerLine = ctx.attendeeName
    ? `Caller: ${ctx.attendeeName}${ctx.attendeePhone ? ` (${ctx.attendeePhone})` : ''}`
    : ctx.attendeePhone ? `Caller: ${ctx.attendeePhone}` : null
  if (callerLine) lines.push(callerLine)
  if (ctx.attendeeEmail) lines.push(`Email: ${ctx.attendeeEmail}`)
  if (ctx.appointmentType) lines.push(`Reason: ${ctx.appointmentType}`)
  if (ctx.callSummary) {
    lines.push('', 'Summary:', ctx.callSummary)
  }
  if (ctx.callLogId) {
    lines.push('', `Call: https://ringster.ai/dashboard/recordings/${ctx.callLogId}`)
  }
  return lines.join('\n')
}

export async function notifyOwnerAndAttendee(ctx: BookingNotificationContext): Promise<void> {
  const { supabase } = ctx
  const { combined, time } = formatBookingTime(ctx.appointmentDatetime, ctx.timezone)
  const bookingsUrl = 'https://ringster.ai/dashboard/calendar'

  // 1. Owner email + SMS
  try {
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('email, full_name, phone_number')
      .eq('id', ctx.ownerUserId)
      .single()

    if (ownerProfile?.email) {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'booking-owner-notification',
          recipientEmail: ownerProfile.email,
          idempotencyKey: `booking-owner-${ctx.bookingId}`,
          templateData: {
            ownerName: ownerProfile.full_name || undefined,
            agentName: ctx.agentName || undefined,
            attendeeName: ctx.attendeeName || undefined,
            attendeePhone: ctx.attendeePhone || undefined,
            attendeeEmail: ctx.attendeeEmail || undefined,
            appointmentType: ctx.appointmentType || 'Appointment',
            startTime: combined,
            timezone: ctx.timezone,
            durationMinutes: ctx.durationMinutes || undefined,
            callSummary: ctx.callSummary || undefined,
            callRecordingUrl: ctx.callLogId
              ? `https://ringster.ai/dashboard/recordings/${ctx.callLogId}`
              : undefined,
            bookingsUrl,
          },
        },
      })
    }

    if (ownerProfile?.phone_number) {
      const smsBody = `Ringster: New booking — ${ctx.attendeeName || 'caller'}${ctx.attendeePhone ? ` (${ctx.attendeePhone})` : ''} on ${combined} ${ctx.timezone}. ${bookingsUrl}`
      await sendTwilioSms(ownerProfile.phone_number, smsBody)
    }
  } catch (e) {
    console.error('Owner notification failed:', e)
  }

  // 2. Attendee SMS confirmation (email already sent by googleBookAppointment)
  if (ctx.attendeePhone) {
    try {
      const body = `Hi ${ctx.attendeeName || 'there'}, your ${ctx.appointmentType || 'appointment'} is confirmed for ${combined} ${ctx.timezone}. Reply to reschedule.`
      await sendTwilioSms(ctx.attendeePhone, body)
    } catch (e) {
      console.error('Attendee SMS failed:', e)
    }
  }

  // suppress unused-var warning
  void time
}
