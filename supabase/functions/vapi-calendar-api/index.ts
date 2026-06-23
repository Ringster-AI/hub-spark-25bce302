import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken, isEncrypted } from '../_shared/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vapi-secret',
}

const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY') || ''
const GOOGLE_API_BASE = 'https://www.googleapis.com'

// Module-scoped service client — reused across requests in the same isolate.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Utility helpers ────────────────────────────────────────────────

function localToUTCISO(naive: string, tz: string): string {
  const asUTC = new Date(naive.replace('Z', '') + 'Z')
  const parts: Record<string, string> = {}
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(asUTC).forEach(p => parts[p.type] = p.value)
  const tzRepr = `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}Z`
  const offsetMs = Date.parse(tzRepr) - asUTC.getTime()
  return new Date(asUTC.getTime() - offsetMs).toISOString()
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 500): Promise<T> {
  let lastError: Error
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const status = err?.status || err?.statusCode
      const retryable = status === 429 || (status >= 500 && status < 600)
      if (!retryable || attempt === retries) throw err
      const delay = baseDelayMs * Math.pow(2, attempt)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError!
}

function getBookingSource(agentType?: string | null) {
  return agentType === 'outbound' ? 'outbound_campaign' : 'inbound'
}

function stringifyBookingValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

function normalizePhoneNumber(...values: unknown[]): string | null {
  const digitWords: Record<string, string> = {
    zero: '0',
    oh: '0',
    o: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
  }

  const source = values.map(stringifyBookingValue).filter(Boolean).join(' ')
  if (!source) return null

  const wordNormalized = source
    .toLowerCase()
    .replace(/[a-z]+/g, (word) => digitWords[word] ?? ' ')

  const candidates = wordNormalized.match(/(?:\+?\d[\s().-]*){10,15}/g) || []
  const rawDigits = (candidates[0] || wordNormalized).replace(/\D/g, '')

  if (rawDigits.length < 10) return null

  const digits = rawDigits.startsWith('1') && rawDigits.length >= 11
    ? rawDigits.slice(0, 11)
    : rawDigits.slice(0, Math.min(rawDigits.length, 15))

  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

function inferAddressFromCombinedField(value: unknown): string | null {
  const text = stringifyBookingValue(value).trim()
  if (!text.includes(',') || !normalizePhoneNumber(text)) return null

  const afterComma = text.split(',').slice(1).join(',').trim()
  return afterComma || null
}

function normalizeAppointmentType(value: unknown): string {
  const text = stringifyBookingValue(value).trim()
  if (!text) return 'consultation'
  if (normalizePhoneNumber(text) || /@/.test(text)) return 'consultation'
  return text
}

function normalizeBookingParams(params: any): any {
  const customFields = params.custom_fields && typeof params.custom_fields === 'object' && !Array.isArray(params.custom_fields)
    ? { ...params.custom_fields }
    : null

  const normalizedPhone = normalizePhoneNumber(
    params.attendee_phone,
    params.phone,
    params.phone_number,
    params.phoneNumber,
    params.attendeePhone,
    params.caller_phone,
    params.callerPhone,
    params.customer_phone,
    params.customerPhone,
    params.contact_phone,
    params.mobile,
    params.cell,
    params.appointment_type,
    params.notes,
    customFields
  )

  const normalizedAddress = params.attendee_address
    || params.service_address
    || params.serviceAddress
    || params.address
    || params.location
    || inferAddressFromCombinedField(params.appointment_type)

  return {
    ...params,
    attendee_phone: normalizedPhone || params.attendee_phone || null,
    attendee_address: normalizedAddress || params.attendee_address || null,
    custom_fields: customFields,
    appointment_type: normalizeAppointmentType(params.appointment_type),
  }
}

// ─── Tenant resolution (provider-agnostic) ──────────────────────────

type CalendarProvider = 'google' | 'cal_com' | 'calendly'

interface TenantInfo {
  agent: any
  provider: CalendarProvider
  integration: any // google_integrations row OR integrations row
  calendarTool: any
  calendarId: string
}

async function resolveTenant(supabase: any, assistantId: string): Promise<TenantInfo> {
  const { data: agent, error: agentError } = await supabase
    .from('agent_configs')
    .select('id, user_id, agent_type, config')
    .eq('vapi_assistant_id', assistantId)
    .single()

  if (agentError || !agent) {
    throw new Error(`Agent not found for assistant ${assistantId}`)
  }

  const { data: calendarTool } = await supabase
    .from('calendar_tools')
    .select('configuration')
    .eq('agent_id', agent.id)
    .eq('tool_name', 'calendar_booking')
    .eq('is_enabled', true)
    .single()

  const toolConfig = calendarTool?.configuration as any || {}

  // Check the new integrations table first for cal_com or calendly
  const { data: newIntegrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', agent.user_id)
    .eq('is_active', true)
    .in('integration_type', ['cal_com', 'calendly'])
    .order('updated_at', { ascending: false })
    .limit(1)

  if (newIntegrations && newIntegrations.length > 0) {
    const integ = newIntegrations[0]
    return {
      agent,
      provider: integ.integration_type as CalendarProvider,
      integration: integ,
      calendarTool: toolConfig,
      calendarId: toolConfig.calendar_id || 'primary',
    }
  }

  // Fall back to google_integrations
  const { data: googleInteg, error: intError } = await supabase
    .from('google_integrations')
    .select('*')
    .eq('user_id', agent.user_id)
    .limit(1)
    .single()

  if (intError || !googleInteg) {
    throw new Error('No calendar integration connected for this agent owner')
  }

  const calendarId = toolConfig.calendar_id || googleInteg.calendar_id || 'primary'
  return { agent, provider: 'google', integration: googleInteg, calendarTool: toolConfig, calendarId }
}

// ─── Google helpers ─────────────────────────────────────────────────

async function refreshGoogleToken(supabase: any, integration: any): Promise<string> {
  const now = new Date()
  const expiresAt = new Date(integration.expires_at)

  if (expiresAt > now) {
    let token = integration.access_token
    if (TOKEN_ENCRYPTION_KEY && isEncrypted(token)) {
      token = await decryptToken(token, TOKEN_ENCRYPTION_KEY)
    }
    return token
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  let refreshToken = integration.refresh_token
  if (TOKEN_ENCRYPTION_KEY && isEncrypted(refreshToken)) {
    refreshToken = await decryptToken(refreshToken, TOKEN_ENCRYPTION_KEY)
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw Object.assign(new Error(`Token refresh failed: ${errBody}`), { permanent: true, status: res.status })
  }

  const data = await res.json()
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabase
    .from('google_integrations')
    .update({ access_token: data.access_token, expires_at: newExpiresAt })
    .eq('id', integration.id)

  return data.access_token
}

async function notifyOwnerAuthFailure(supabase: any, integration: any, userId: string, errorMsg: string) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const integrationId = integration.id

    // Try to find integration_logs entry (works for both google_integrations and integrations)
    await supabase.from('integration_logs').insert({
      integration_id: integrationId,
      action: 'auth_failure',
      status: 'error',
      message: errorMsg,
      details: { user_id: userId },
    }).catch(() => {})

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (profile?.email) {
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'calendar-reconnect-required',
            recipientEmail: profile.email,
            idempotencyKey: `calendar-reconnect-${userId}-${new Date().toISOString().slice(0,10)}`,
            templateData: {
              name: profile.full_name || undefined,
              provider: integration.provider || 'calendar',
              reconnectUrl: 'https://ringster.ai/dashboard/settings',
            },
          },
        })
      } catch (e) {
        console.error('Failed to send auth failure email:', e)
      }
    }
  } catch (e) {
    console.error('Error in notifyOwnerAuthFailure:', e)
  }
}

// ─── Cal.com helpers ────────────────────────────────────────────────

async function getCalComApiKey(integration: any): Promise<string> {
  const creds = integration.credentials as Record<string, any>
  if (creds.encrypted && TOKEN_ENCRYPTION_KEY) {
    const decrypted = JSON.parse(await decryptToken(creds.encrypted, TOKEN_ENCRYPTION_KEY))
    return decrypted.api_key
  }
  return creds.api_key
}

async function calComCheckAvailability(
  supabase: any,
  tenant: TenantInfo,
  params: { date: string; timezone?: string; duration_minutes?: number }
) {
  const apiKey = await getCalComApiKey(tenant.integration)
  const tz = params.timezone || 'America/New_York'
  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30
  const config = tenant.integration.configuration as Record<string, any> || {}
  const username = (tenant.integration.metadata as any)?.username || config.username

  if (!username) {
    throw new Error('Cal.com username not configured. Please update your Cal.com integration settings.')
  }

  const eventTypeSlug = config.event_type_slug || tenant.calendarTool.event_type_slug

  // Cal.com v2 slots endpoint
  const startTime = `${params.date}T00:00:00.000Z`
  const endTime = `${params.date}T23:59:59.000Z`

  const url = new URL('https://api.cal.com/v2/slots/available')
  url.searchParams.set('startTime', startTime)
  url.searchParams.set('endTime', endTime)
  if (eventTypeSlug) url.searchParams.set('eventTypeSlug', eventTypeSlug)
  url.searchParams.set('username', username)

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': '2024-08-13',
    },
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Cal.com availability check failed: ${errText}`)
  }

  const data = await res.json()
  const rawSlots = data.data?.slots?.[params.date] || []

  const slots = rawSlots.map((slot: any) => ({
    start: slot.time || slot.start,
    end: slot.time
      ? new Date(new Date(slot.time).getTime() + duration * 60000).toISOString()
      : slot.end,
  }))

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'check_availability',
    parameters: { ...params, provider: 'cal_com' },
    result: { slots_count: slots.length },
    status: 'success',
  })

  const now = new Date()
  const currentDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })

  return {
    available_slots: slots,
    timezone: tz,
    duration_minutes: duration,
    current_date: currentDateFormatter.format(now),
    current_day_of_week: dayFormatter.format(now),
    message: slots.length > 0
      ? `Found ${slots.length} available slots on ${params.date}.`
      : `No available slots on ${params.date}. Please try another day.`,
  }
}

async function calComBookAppointment(
  supabase: any,
  tenant: TenantInfo,
  params: any
) {
  const apiKey = await getCalComApiKey(tenant.integration)
  const config = tenant.integration.configuration as Record<string, any> || {}
  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30

  // Cal.com v2 bookings endpoint
  const bookingBody: Record<string, any> = {
    start: params.datetime,
    lengthInMinutes: duration,
    attendee: {
      name: params.attendee_name,
      email: params.attendee_email,
      timeZone: params.timezone || 'America/New_York',
    },
    metadata: {
      source: 'ringster_ai',
      agent_id: tenant.agent.id,
    },
  }

  if (config.event_type_slug) {
    bookingBody.eventTypeSlug = config.event_type_slug
  }

  const res = await fetch('https://api.cal.com/v2/bookings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
    },
    body: JSON.stringify(bookingBody),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Cal.com booking failed:', errText)
    return { error: true, message: 'Failed to book appointment via Cal.com. Please try again.' }
  }

  const bookingData = await res.json()
  const calBooking = bookingData.data

  // Store in calendar_bookings
  const rawStart = params.datetime.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
  const bookingRecord: Record<string, any> = {
    appointment_datetime: rawStart,
    duration_minutes: duration,
    attendee_name: params.attendee_name,
    attendee_email: params.attendee_email || null,
    appointment_type: params.appointment_type || 'consultation',
    booking_status: 'confirmed',
    google_event_id: `calcom_${calBooking?.uid || calBooking?.id || Date.now()}`,
    booking_source: getBookingSource(tenant.agent.agent_type),
    idempotency_key: params.idempotency_key || null,
    notes: `Booked by agent ${tenant.agent.id} via Cal.com`,
    metadata: { provider: 'cal_com', cal_booking_id: calBooking?.uid || calBooking?.id },
  }

  const { data: booking, error: insertError } = await supabase
    .from('calendar_bookings')
    .insert(bookingRecord)
    .select()
    .single()

  if (insertError) {
    console.error('DB insert failed for Cal.com booking:', insertError)
  }

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'book_appointment',
    parameters: { ...params, assistant_id: '[redacted]', provider: 'cal_com' },
    result: { booking_id: booking?.id, cal_booking_uid: calBooking?.uid },
    status: 'success',
  })

  return {
    error: false,
    message: `Appointment booked successfully for ${params.attendee_name} via Cal.com. A confirmation email has been sent.`,
    booking: { id: booking?.id, datetime: params.datetime, duration_minutes: duration, attendee_name: params.attendee_name },
  }
}

// ─── Calendly helpers ───────────────────────────────────────────────

async function getCalendlyToken(supabase: any, integration: any): Promise<string> {
  const creds = integration.credentials as Record<string, any>
  let accessToken: string
  let refreshToken: string

  if (creds.encrypted && TOKEN_ENCRYPTION_KEY) {
    const decrypted = JSON.parse(await decryptToken(creds.encrypted, TOKEN_ENCRYPTION_KEY))
    accessToken = decrypted.access_token
    refreshToken = decrypted.refresh_token
  } else {
    accessToken = creds.access_token
    refreshToken = creds.refresh_token
  }

  // Check expiry
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    // Refresh
    const clientId = Deno.env.get('CALENDLY_CLIENT_ID')!
    const clientSecret = Deno.env.get('CALENDLY_CLIENT_SECRET')!

    const tokenRes = await fetch('https://auth.calendly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw Object.assign(new Error(`Calendly token refresh failed: ${errText}`), { permanent: true })
    }

    const tokens = await tokenRes.json()
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString()

    let newCreds: Record<string, any> = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
    }
    if (TOKEN_ENCRYPTION_KEY) {
      const { encryptToken } = await import('../_shared/crypto.ts')
      const encrypted = await encryptToken(JSON.stringify(newCreds), TOKEN_ENCRYPTION_KEY)
      newCreds = { encrypted }
    }

    await supabase
      .from('integrations')
      .update({ credentials: newCreds, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', integration.id)

    return tokens.access_token
  }

  return accessToken
}

async function calendlyCheckAvailability(
  supabase: any,
  tenant: TenantInfo,
  params: { date: string; timezone?: string; duration_minutes?: number }
) {
  const accessToken = await getCalendlyToken(supabase, tenant.integration)
  const tz = params.timezone || 'America/New_York'
  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30
  const config = tenant.integration.configuration as Record<string, any> || {}
  const metadata = tenant.integration.metadata as Record<string, any> || {}

  // Need to get event types to find the right one
  const userUri = metadata.user_uri
  if (!userUri) {
    throw new Error('Calendly user URI not found. Please reconnect Calendly.')
  }

  // Get event types
  const eventTypesRes = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!eventTypesRes.ok) {
    const errText = await eventTypesRes.text()
    throw new Error(`Calendly event types fetch failed: ${errText}`)
  }

  const eventTypesData = await eventTypesRes.json()
  const eventTypes = eventTypesData.collection || []

  // Use configured event type URI or first available
  let eventTypeUri = config.event_type_uri
  if (!eventTypeUri && eventTypes.length > 0) {
    eventTypeUri = eventTypes[0].uri
  }

  if (!eventTypeUri) {
    return { available_slots: [], message: 'No Calendly event types found.' }
  }

  // Get available times
  const startTime = `${params.date}T00:00:00.000000Z`
  const endTime = `${params.date}T23:59:59.000000Z`

  const availUrl = new URL('https://api.calendly.com/event_type_available_times')
  availUrl.searchParams.set('event_type', eventTypeUri)
  availUrl.searchParams.set('start_time', startTime)
  availUrl.searchParams.set('end_time', endTime)

  const availRes = await fetch(availUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!availRes.ok) {
    const errText = await availRes.text()
    throw new Error(`Calendly availability check failed: ${errText}`)
  }

  const availData = await availRes.json()
  const rawSlots = availData.collection || []

  const slots = rawSlots
    .filter((slot: any) => slot.status === 'available')
    .map((slot: any) => ({
      start: slot.start_time,
      end: new Date(new Date(slot.start_time).getTime() + duration * 60000).toISOString(),
    }))

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'check_availability',
    parameters: { ...params, provider: 'calendly' },
    result: { slots_count: slots.length },
    status: 'success',
  })

  const now = new Date()
  const currentDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })

  return {
    available_slots: slots,
    timezone: tz,
    duration_minutes: duration,
    current_date: currentDateFormatter.format(now),
    current_day_of_week: dayFormatter.format(now),
    message: slots.length > 0
      ? `Found ${slots.length} available slots on ${params.date}.`
      : `No available slots on ${params.date}. Please try another day.`,
  }
}

async function calendlyBookAppointment(
  supabase: any,
  tenant: TenantInfo,
  params: any
) {
  const accessToken = await getCalendlyToken(supabase, tenant.integration)
  const config = tenant.integration.configuration as Record<string, any> || {}
  const metadata = tenant.integration.metadata as Record<string, any> || {}
  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30

  // Calendly doesn't have a direct "create booking" API for external use.
  // Instead, we create a scheduling link or use the one-off meeting approach.
  // For real-time agent booking, we'll use the Calendly scheduled_events + invitee approach
  // or fall back to storing the booking locally and creating a scheduling link.

  // Get event types
  const userUri = metadata.user_uri
  let eventTypeUri = config.event_type_uri

  if (!eventTypeUri && userUri) {
    const eventTypesRes = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (eventTypesRes.ok) {
      const etData = await eventTypesRes.json()
      if (etData.collection?.length > 0) {
        eventTypeUri = etData.collection[0].uri
      }
    }
  }

  // Since Calendly doesn't support direct booking via API (only scheduling links),
  // we store the booking in our DB and create a one-off scheduling link
  const rawStart = params.datetime.replace(/([+-]\d{2}:\d{2}|Z)$/, '')

  // Create scheduling link for the invitee
  let schedulingLink: string | null = null
  if (eventTypeUri) {
    try {
      const linkRes = await fetch('https://api.calendly.com/scheduling_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_event_count: 1,
          owner: eventTypeUri,
          owner_type: 'EventType',
        }),
      })
      if (linkRes.ok) {
        const linkData = await linkRes.json()
        schedulingLink = linkData.resource?.booking_url
      }
    } catch (e) {
      console.error('Failed to create Calendly scheduling link:', e)
    }
  }

  // Store in calendar_bookings
  const bookingRecord: Record<string, any> = {
    appointment_datetime: rawStart,
    duration_minutes: duration,
    attendee_name: params.attendee_name,
    attendee_email: params.attendee_email || null,
    appointment_type: params.appointment_type || 'consultation',
    booking_status: schedulingLink ? 'pending' : 'confirmed',
    google_event_id: `calendly_${Date.now()}`,
    booking_source: getBookingSource(tenant.agent.agent_type),
    idempotency_key: params.idempotency_key || null,
    notes: `Booked by agent ${tenant.agent.id} via Calendly`,
    metadata: { provider: 'calendly', scheduling_link: schedulingLink },
  }

  const { data: booking, error: insertError } = await supabase
    .from('calendar_bookings')
    .insert(bookingRecord)
    .select()
    .single()

  if (insertError) {
    console.error('DB insert failed for Calendly booking:', insertError)
  }

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'book_appointment',
    parameters: { ...params, assistant_id: '[redacted]', provider: 'calendly' },
    result: { booking_id: booking?.id, scheduling_link: schedulingLink },
    status: 'success',
  })

  const confirmMsg = schedulingLink
    ? `Appointment request created for ${params.attendee_name}. A scheduling link has been generated for confirmation.`
    : `Appointment booked successfully for ${params.attendee_name} via Calendly.`

  return {
    error: false,
    message: confirmMsg,
    booking: { id: booking?.id, datetime: params.datetime, duration_minutes: duration, attendee_name: params.attendee_name, scheduling_link: schedulingLink },
  }
}

// ─── Google availability & booking (original logic) ─────────────────

async function googleCheckAvailability(
  supabase: any,
  tenant: TenantInfo,
  params: { date: string; timezone?: string; duration_minutes?: number; assistant_id: string }
) {
  const tz = params.timezone || 'America/New_York'
  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30

  let accessToken: string
  try {
    accessToken = await refreshGoogleToken(supabase, tenant.integration)
  } catch (e: any) {
    if (e.permanent) {
      await notifyOwnerAuthFailure(supabase, tenant.integration, tenant.agent.user_id, e.message)
    }
    throw e
  }

  const timeMin = localToUTCISO(`${params.date}T00:00:00`, tz)
  const timeMax = localToUTCISO(`${params.date}T23:59:59`, tz)

  const freeBusyRes = await withRetry(async () => {
    const res = await fetch(`${GOOGLE_API_BASE}/calendar/v3/freeBusy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, timeZone: tz, items: [{ id: tenant.calendarId }] }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw Object.assign(new Error(`FreeBusy API error: ${errText}`), { status: res.status })
    }
    return res.json()
  })

  const busyPeriods = freeBusyRes.calendars?.[tenant.calendarId]?.busy || []

  const businessStart = tenant.calendarTool.business_hours_start || tenant.integration.availability_start || '09:00'
  const businessEnd = tenant.calendarTool.business_hours_end || tenant.integration.availability_end || '17:00'
  const bufferMinutes = tenant.calendarTool.buffer_time || tenant.integration.buffer_time || 10
  const allowedDays = tenant.integration.availability_days || [1, 2, 3, 4, 5]

  const requestedDay = new Date(`${params.date}T12:00:00`).getDay()
  if (!allowedDays.includes(requestedDay === 0 ? 7 : requestedDay)) {
    return { available_slots: [], message: `This day is not available for bookings.` }
  }

  const [startH, startM] = businessStart.split(':').map(Number)
  const [endH, endM] = businessEnd.split(':').map(Number)
  const businessStartMin = startH * 60 + startM
  const businessEndMin = endH * 60 + endM

  const slots: Array<{ start: string; end: string }> = []
  const slotIncrement = 30

  for (let minuteOfDay = businessStartMin; minuteOfDay + duration <= businessEndMin; minuteOfDay += slotIncrement) {
    const slotStartH = Math.floor(minuteOfDay / 60)
    const slotStartM = minuteOfDay % 60
    const slotStart = `${params.date}T${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}:00`

    const slotEndMinute = minuteOfDay + duration
    const slotEndH = Math.floor(slotEndMinute / 60)
    const slotEndM = slotEndMinute % 60
    const slotEnd = `${params.date}T${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}:00`

    const slotStartUTC = new Date(localToUTCISO(slotStart, tz))
    const slotEndUTC = new Date(localToUTCISO(slotEnd, tz))

    const bufferedStart = new Date(slotStartUTC.getTime() - bufferMinutes * 60000)
    const bufferedEnd = new Date(slotEndUTC.getTime() + bufferMinutes * 60000)

    let isFree = true
    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start)
      const busyEnd = new Date(busy.end)
      if (bufferedStart < busyEnd && bufferedEnd > busyStart) {
        isFree = false
        break
      }
    }

    if (isFree) {
      slots.push({ start: slotStart, end: slotEnd })
    }
  }

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'check_availability',
    parameters: params,
    result: { slots_count: slots.length },
    status: 'success',
  })

  const now = new Date()
  const currentDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })

  return {
    available_slots: slots,
    timezone: tz,
    duration_minutes: duration,
    current_date: currentDateFormatter.format(now),
    current_day_of_week: dayFormatter.format(now),
    message: slots.length > 0
      ? `Found ${slots.length} available slots on ${params.date}.`
      : `No available slots on ${params.date}. Please try another day.`,
  }
}

async function googleBookAppointment(
  supabase: any,
  tenant: TenantInfo,
  params: any
) {
  if (!params.attendee_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.attendee_email)) {
    return {
      error: true,
      message: 'A valid email address is required to book an appointment. Please ask the caller for their email address.',
    }
  }
  // Required-field validation now centralized in bookAppointment() dispatcher.


  const duration = params.duration_minutes || tenant.calendarTool.default_duration || 30
  const tz = params.timezone || 'America/New_York'

  if (params.idempotency_key) {
    const { data: existing } = await supabase
      .from('calendar_bookings')
      .select('*')
      .eq('idempotency_key', params.idempotency_key)
      .single()

    if (existing) {
      return { error: false, message: 'Appointment already booked.', booking: existing }
    }
  }

  let accessToken: string
  try {
    accessToken = await refreshGoogleToken(supabase, tenant.integration)
  } catch (e: any) {
    if (e.permanent) {
      await notifyOwnerAuthFailure(supabase, tenant.integration, tenant.agent.user_id, e.message)
    }
    throw e
  }

  const rawStart = params.datetime.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
  const [datePart, timePart] = rawStart.split('T')
  const [hh, mm] = (timePart || '12:00:00').split(':').map(Number)
  const endTotalMin = hh * 60 + mm + duration
  const endHH = String(Math.floor(endTotalMin / 60)).padStart(2, '0')
  const endMM = String(endTotalMin % 60).padStart(2, '0')
  const rawEnd = `${datePart}T${endHH}:${endMM}:00`

  const freeBusyTimeMin = localToUTCISO(rawStart, tz)
  const freeBusyTimeMax = localToUTCISO(rawEnd, tz)
  const freeBusyRes = await withRetry(async () => {
    const res = await fetch(`${GOOGLE_API_BASE}/calendar/v3/freeBusy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: freeBusyTimeMin, timeMax: freeBusyTimeMax, timeZone: tz, items: [{ id: tenant.calendarId }] }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw Object.assign(new Error(`FreeBusy check failed: ${errText}`), { status: res.status })
    }
    return res.json()
  })

  const busyPeriods = freeBusyRes.calendars?.[tenant.calendarId]?.busy || []
  if (busyPeriods.length > 0) {
    return { error: true, message: 'This time slot is no longer available. Please choose a different time.' }
  }

  const eventBody = {
    summary: `${params.appointment_type || 'Appointment'} - ${params.attendee_name}`,
    description: `Booked via Ringster AI agent`,
    start: { dateTime: rawStart, timeZone: tz },
    end: { dateTime: rawEnd, timeZone: tz },
    attendees: params.attendee_email ? [{ email: params.attendee_email }] : [],
  }

  let googleEvent: any
  try {
    googleEvent = await withRetry(async () => {
      const res = await fetch(
        `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(tenant.calendarId)}/events?sendUpdates=all`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
      )
      if (!res.ok) {
        const errText = await res.text()
        throw Object.assign(new Error(`Google event creation failed: ${errText}`), { status: res.status })
      }
      return res.json()
    })
  } catch {
    return { error: true, message: 'Failed to create calendar event. Please try again.' }
  }

  const metadata: Record<string, any> = {}
  if (params.attendee_phone) metadata.attendee_phone = params.attendee_phone
  if (params.attendee_address) metadata.attendee_address = params.attendee_address
  if (params.custom_fields) metadata.custom_fields = params.custom_fields

  const bookingRecord: Record<string, any> = {
    appointment_datetime: rawStart,
    duration_minutes: duration,
    attendee_name: params.attendee_name,
    attendee_email: params.attendee_email || null,
    appointment_type: params.appointment_type || 'consultation',
    booking_status: 'confirmed',
    google_event_id: googleEvent.id,
    google_integration_id: tenant.integration.id,
    booking_source: getBookingSource(tenant.agent.agent_type),
    idempotency_key: params.idempotency_key || null,
    notes: `Booked by agent ${tenant.agent.id}`,
    metadata: Object.keys(metadata).length > 0 ? metadata : {},
  }

  const { data: booking, error: insertError } = await supabase
    .from('calendar_bookings')
    .insert(bookingRecord)
    .select()
    .single()

  if (insertError) {
    console.error('DB insert failed, rolling back Google event:', insertError)
    try {
      await fetch(
        `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(tenant.calendarId)}/events/${googleEvent.id}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
    } catch (delErr) {
      console.error('Failed to delete Google event during rollback:', delErr)
    }

    return {
      error: true,
      message: insertError.message?.includes('no_overlapping_bookings')
        ? 'This time slot was just booked by someone else. Please choose a different time.'
        : 'Failed to save booking. Please try again.',
    }
  }

  await supabase.from('tool_call_logs').insert({
    agent_id: tenant.agent.id,
    tool_name: 'book_appointment',
    parameters: { ...params, assistant_id: '[redacted]' },
    result: { booking_id: booking.id, google_event_id: googleEvent.id },
    status: 'success',
  })

  const displayTime = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const displayHour = hh > 12 ? hh - 12 : (hh === 0 ? 12 : hh)
  const formattedTime = `${displayHour}:${String(mm).padStart(2,'0')} ${ampm}`
  const formattedDate = new Date(datePart + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

  // Send confirmation email
  if (params.attendee_email) {
    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'booking-confirmation',
          recipientEmail: params.attendee_email,
          idempotencyKey: `booking-confirm-${booking.id}`,
          templateData: {
            name: params.attendee_name,
            bookingTitle: params.appointment_type || 'Consultation',
            startTime: `${formattedDate} at ${formattedTime}`,
            timezone: tz,
            notes: params.notes || undefined,
          },
        },
      })
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr)
    }
  }

  return {
    error: false,
    message: `Appointment booked successfully for ${params.attendee_name} on ${datePart} at ${formattedTime} ${tz} for ${duration} minutes. A confirmation email has been sent to ${params.attendee_email}.`,
    booking: { id: booking.id, datetime: params.datetime, duration_minutes: duration, attendee_name: params.attendee_name },
  }
}

// ─── Provider dispatcher ────────────────────────────────────────────

async function checkAvailability(supabase: any, params: any) {
  const tenant = await resolveTenant(supabase, params.assistant_id)

  switch (tenant.provider) {
    case 'cal_com':
      return calComCheckAvailability(supabase, tenant, params)
    case 'calendly':
      return calendlyCheckAvailability(supabase, tenant, params)
    case 'google':
    default:
      return googleCheckAvailability(supabase, tenant, params)
  }
}

async function bookAppointment(supabase: any, params: any) {
  params = normalizeBookingParams(params)

  // Validate email for all providers
  if (!params.attendee_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.attendee_email)) {
    return {
      error: true,
      message: 'A valid email address is required to book an appointment. Please ask the caller for their email address.',
    }
  }

  const tenant = await resolveTenant(supabase, params.assistant_id)

  // Centralized required-field validation (applies to every provider).
  const agentConfig = tenant.agent.config as Record<string, any> | null
  const calendarBookingConfig = agentConfig?.calendar_booking as Record<string, any> | null
  const requiredFields = (calendarBookingConfig?.required_fields as string[]) || []
  const customFieldDefs = (calendarBookingConfig?.custom_fields as Array<{ name: string; description?: string }>) || []
  const customFieldsProvided = (params.custom_fields && typeof params.custom_fields === 'object') ? params.custom_fields : {}

  for (const field of requiredFields) {
    if (field === 'phone' && !params.attendee_phone) {
      return { error: true, message: 'A usable phone number is required for this booking. Please ask the caller for their phone number, then pass it in the attendee_phone field exactly as heard; digits, spaces, dashes, and spoken digit words are accepted.' }
    }
    if (field === 'address' && !params.attendee_address) {
      return { error: true, message: 'A service address is required for this booking. Please ask the caller for their service address before booking.' }
    }
    if (field.startsWith('custom:')) {
      const name = field.slice('custom:'.length)
      const value = customFieldsProvided[name]
      if (value === undefined || value === null || value === '') {
        const def = customFieldDefs.find(f => f.name === name)
        const label = def?.description || name
        return { error: true, message: `${label} is required for this booking. Please ask the caller for this information before booking.` }
      }
    }
  }

  // Idempotency check (shared across providers)
  if (params.idempotency_key) {
    const { data: existing } = await supabase
      .from('calendar_bookings')
      .select('*')
      .eq('idempotency_key', params.idempotency_key)
      .single()

    if (existing) {
      return { error: false, message: 'Appointment already booked.', booking: existing }
    }
  }

  switch (tenant.provider) {
    case 'cal_com':
      return calComBookAppointment(supabase, tenant, params)
    case 'calendly':
      return calendlyBookAppointment(supabase, tenant, params)
    case 'google':
    default:
      return googleBookAppointment(supabase, tenant, params)
  }
}


// ─── HTTP handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const secret = req.headers.get('x-vapi-secret')
  const expectedSecret = Deno.env.get('VAPI_CALENDAR_SECRET')

  if (!secret || secret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: true, message: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }




  try {
    const body = await req.json()
    const { action, ...params } = body
    const requestId = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    console.log(`[${requestId}] vapi-calendar-api action=${action}`, { params: { ...params, assistant_id: params.assistant_id?.slice(0, 8) + '...' } })

    let result: any

    if (action === 'check_availability') {
      result = await checkAvailability(supabase, params)
    } else if (action === 'book_appointment') {
      result = await bookAppointment(supabase, params)
    } else {
      result = { error: true, message: `Unknown action: ${action}` }
    }

    console.log(`[${requestId}] completed`, {
      error: result.error,
      message: result.error ? result.message : undefined,
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('vapi-calendar-api error:', err)

    const message = err.permanent
      ? 'Calendar authentication has expired. The business owner has been notified.'
      : 'Calendar service error. Please try again.'

    return new Response(
      JSON.stringify({ error: true, message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
