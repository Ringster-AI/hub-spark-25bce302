import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOL_VERSION = '1.3'
const VAPI_API_URL = 'https://api.vapi.ai/tool'

// Code tool source for check_availability
const CHECK_AVAILABILITY_CODE = `
async function main({ params, call }) {
  try {
    const assistantId = call?.assistant?.id || params.assistant_id;
    if (!assistantId) {
      return { error: true, message: 'Could not determine assistant identity.' };
    }
    const res = await fetch(params.SUPABASE_URL + '/functions/v1/vapi-calendar-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vapi-secret': params.CALENDAR_SECRET,
      },
      body: JSON.stringify({
        action: 'check_availability',
        assistant_id: assistantId,
        date: params.date,
        timezone: params.timezone || 'America/New_York',
        duration_minutes: params.duration_minutes || 30,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: true, message: 'Calendar service error' }));
      return err;
    }
    return await res.json();
  } catch (e) {
    return { error: true, message: 'Calendar service temporarily unavailable. Please try again.' };
  }
}
`

// Code tool source for book_appointment
const BOOK_APPOINTMENT_CODE = `
async function main({ params, call }) {
  try {
    const assistantId = call?.assistant?.id || params.assistant_id;
    if (!assistantId) {
      return { error: true, message: 'Could not determine assistant identity.' };
    }
    const idempotencyKey = crypto.randomUUID();
    const body = {
      action: 'book_appointment',
      assistant_id: assistantId,
      datetime: params.datetime,
      attendee_name: params.attendee_name,
      attendee_email: params.attendee_email || null,
      attendee_phone: params.attendee_phone || null,
      attendee_address: params.attendee_address || null,
      custom_fields: params.custom_fields || null,
      duration_minutes: params.duration_minutes || 30,
      appointment_type: params.appointment_type || 'consultation',
      timezone: params.timezone || 'America/New_York',
      idempotency_key: idempotencyKey,
    };
    const res = await fetch(params.SUPABASE_URL + '/functions/v1/vapi-calendar-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vapi-secret': params.CALENDAR_SECRET,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: true, message: 'Booking service error' }));
      return err;
    }
    return await res.json();
  } catch (e) {
    return { error: true, message: 'Booking service temporarily unavailable. Please try again.' };
  }
}
`

// Code tool source for get_current_datetime
const GET_CURRENT_DATETIME_CODE = `
async function main({ params }) {
  try {
    const tz = params.timezone || 'America/New_York';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const isoDate = dateFormatter.format(now);
    return {
      current_date: isoDate,
      day_of_week: get('weekday'),
      current_time: get('hour') + ':' + get('minute') + ':' + get('second') + ' ' + get('dayPeriod'),
      timezone: tz,
      formatted: formatter.format(now),
    };
  } catch (e) {
    return { error: true, message: 'Could not determine current date/time.' };
  }
}
`

function buildCheckAvailabilityTool(supabaseUrl: string, calendarSecret: string) {
  return {
    type: 'code',
    function: {
      name: 'check_availability',
      description: 'Check available appointment slots on a specific date. Returns available time slots for booking. Always call get_current_datetime first to know what today\'s date is before checking availability.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'The date to check availability for, in YYYY-MM-DD format' },
          timezone: { type: 'string', description: 'The caller\'s timezone (e.g., "America/New_York", "America/Los_Angeles"). Ask the caller if unsure.' },
          duration_minutes: { type: 'number', description: 'Duration of the appointment in minutes. Default is 30.' },
        },
        required: ['date'],
      },
    },
    code: CHECK_AVAILABILITY_CODE,
    environmentVariables: [
      { name: 'SUPABASE_URL', value: supabaseUrl },
      { name: 'CALENDAR_SECRET', value: calendarSecret },
    ],
  }
}

function buildBookAppointmentTool(supabaseUrl: string, calendarSecret: string) {
  return {
    type: 'code',
    function: {
      name: 'book_appointment',
      description: 'Book an appointment at a specific date and time. Use check_availability first to find open slots. Requires the attendee\'s name and email address. The agent\'s configuration determines which additional fields are required (phone, address, etc.). Always collect all required information before booking.',
      parameters: {
        type: 'object',
        properties: {
          datetime: { type: 'string', description: 'The appointment date and time in ISO format (e.g., "2025-03-15T10:00:00")' },
          attendee_name: { type: 'string', description: 'Full name of the person booking the appointment' },
          attendee_email: { type: 'string', description: 'Email address of the person booking. This is required to send a confirmation email.' },
          attendee_phone: { type: 'string', description: 'Phone number of the person booking. Required by some businesses.' },
          attendee_address: { type: 'string', description: 'Service address of the person booking. Required by some businesses for on-site service calls.' },
          custom_fields: { type: 'object', description: 'Additional custom fields as key-value pairs (e.g., {"Insurance ID": "ABC123", "Vehicle make": "Toyota Camry"})' },
          duration_minutes: { type: 'number', description: 'Duration of the appointment in minutes. Default is 30.' },
          appointment_type: { type: 'string', description: 'Type of appointment (e.g., "consultation", "follow-up", "demo")' },
          timezone: { type: 'string', description: 'The caller\'s timezone (e.g., "America/New_York")' },
        },
        required: ['datetime', 'attendee_name', 'attendee_email'],
      },
    },
    code: BOOK_APPOINTMENT_CODE,
    environmentVariables: [
      { name: 'SUPABASE_URL', value: supabaseUrl },
      { name: 'CALENDAR_SECRET', value: calendarSecret },
    ],
  }
}

function buildGetCurrentDatetimeTool() {
  return {
    type: 'code',
    function: {
      name: 'get_current_datetime',
      description: 'Get the current date, time, and day of the week. Call this whenever you need to know what day it is today, or before checking calendar availability. Returns the current date in YYYY-MM-DD format, the day of the week, and the current time.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'The timezone to get the current date/time in (e.g., "America/New_York"). Defaults to America/New_York.' },
        },
        required: [],
      },
    },
    code: GET_CURRENT_DATETIME_CODE,
    environmentVariables: [{ name: 'TIMEZONE_DEFAULT', value: 'America/New_York' }],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Authenticate
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Authorize: platform-wide tool registration is admin-only
  const { data: isSuper } = await adminSupabase.rpc('is_super_admin', { _user_id: user.id })
  const { data: isAdmin } = await adminSupabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  if (!isSuper && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }


  try {
    const vapiApiKey = Deno.env.get('VAPI_API_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const calendarSecret = Deno.env.get('VAPI_CALENDAR_SECRET')!

    // Check if tools already exist with current version
    const { data: existingConfig } = await adminSupabase
      .from('vapi_global_config')
      .select('*')
      .eq('key', 'calendar_tools')
      .single()

    const existingValue = existingConfig?.value as any
    if (existingValue?.version === TOOL_VERSION && existingValue?.check_availability_id && existingValue?.book_appointment_id && existingValue?.get_current_datetime_id) {
      // Tools exist and are current version — update them in place (PATCH)
      console.log('Tools exist at current version, updating code...')

      const checkTool = buildCheckAvailabilityTool(supabaseUrl, calendarSecret)
      const bookTool = buildBookAppointmentTool(supabaseUrl, calendarSecret)
      const dateTool = buildGetCurrentDatetimeTool()

      await Promise.all([
        fetch(`${VAPI_API_URL}/${existingValue.check_availability_id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(checkTool),
        }),
        fetch(`${VAPI_API_URL}/${existingValue.book_appointment_id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bookTool),
        }),
        fetch(`${VAPI_API_URL}/${existingValue.get_current_datetime_id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(dateTool),
        }),
      ])

      return new Response(JSON.stringify({
        message: 'Calendar tools updated',
        check_availability_id: existingValue.check_availability_id,
        book_appointment_id: existingValue.book_appointment_id,
        get_current_datetime_id: existingValue.get_current_datetime_id,
        version: TOOL_VERSION,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create new tools (or recreate if version bumped)
    console.log('Creating new calendar tools (version', TOOL_VERSION, ')...')

    const checkTool = buildCheckAvailabilityTool(supabaseUrl, calendarSecret)
    const bookTool = buildBookAppointmentTool(supabaseUrl, calendarSecret)
    const dateTool = buildGetCurrentDatetimeTool()

    const [checkRes, bookRes, dateRes] = await Promise.all([
      fetch(VAPI_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(checkTool),
      }),
      fetch(VAPI_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bookTool),
      }),
      fetch(VAPI_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${vapiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dateTool),
      }),
    ])

    if (!checkRes.ok || !bookRes.ok || !dateRes.ok) {
      const checkErr = await checkRes.text()
      const bookErr = await bookRes.text()
      const dateErr = await dateRes.text()
      throw new Error(`Failed to create tools: check=${checkErr}, book=${bookErr}, date=${dateErr}`)
    }

    const checkData = await checkRes.json()
    const bookData = await bookRes.json()
    const dateData = await dateRes.json()

    // Store tool IDs in vapi_global_config
    await adminSupabase
      .from('vapi_global_config')
      .upsert({
        key: 'calendar_tools',
        value: {
          check_availability_id: checkData.id,
          book_appointment_id: bookData.id,
          get_current_datetime_id: dateData.id,
          version: TOOL_VERSION,
        },
        updated_at: new Date().toISOString(),
      })

    return new Response(JSON.stringify({
      message: 'Calendar tools created',
      check_availability_id: checkData.id,
      book_appointment_id: bookData.id,
      get_current_datetime_id: dateData.id,
      version: TOOL_VERSION,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('register-vapi-calendar-tools error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
