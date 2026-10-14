
import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { VapiService } from './services/vapi-service'
import { createVapiAssistantConfig } from './services/vapi-config'
import { authenticateRequest, verifyAgentOwnership, corsHeaders, unauthorizedResponse, forbiddenResponse } from './utils/auth'

const VAPI_API_KEY = process.env.VAPI_API_KEY!
const VAPI_API_URL = 'https://api.vapi.ai/assistant'
const VAPI_TOOL_URL = 'https://api.vapi.ai/tool'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Simple retry helper
const withRetry = async <T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 300): Promise<T> => {
  let attempt = 0;
  let lastError: any;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Retrying after error (attempt ${attempt + 1}/${retries + 1})`, { error: String(err), delay });
      await new Promise(res => setTimeout(res, delay));
      attempt++;
    }
  }
  throw lastError;
};

const getAssistantIdFromAgent = (agent: any): string | null => {
  if (typeof agent?.vapi_assistant_id === 'string' && agent.vapi_assistant_id.trim().length > 0) {
    return agent.vapi_assistant_id
  }

  if (agent?.config && typeof agent.config === 'object' && !Array.isArray(agent.config)) {
    const fallbackId = (agent.config as Record<string, unknown>).vapi_assistant_id
    if (typeof fallbackId === 'string' && fallbackId.trim().length > 0) {
      return fallbackId
    }
  }

  return null
};

const CALENDAR_TOOL_VERSION = '2.7'

type CalendarToolConfig = {
  version: string
  signature?: string | null
  check_availability_id?: string | null
  book_appointment_id?: string | null
  get_current_datetime_id?: string | null
  send_sms_id?: string | null
}

type BookingFieldDef = {
  key: string
  label: string
  required: boolean
  customName?: string
}

/**
 * Build the per-agent registry of booking fields from calendar_booking config.
 * Base fields (datetime / attendee_name / attendee_email) are always required.
 * Phone / address / custom:* fields are added based on `required_fields`.
 * Returning a stable structure lets us derive both the JSON schema and a
 * deterministic signature used to detect schema drift on the live Vapi tool.
 */
function buildBookingFieldRegistry(calendarBookingConfig: Record<string, unknown>): BookingFieldDef[] {
  const requiredFields = Array.isArray(calendarBookingConfig.required_fields)
    ? calendarBookingConfig.required_fields.filter((f): f is string => typeof f === 'string')
    : []
  const customFields = Array.isArray(calendarBookingConfig.custom_fields)
    ? (calendarBookingConfig.custom_fields as Array<{ name?: unknown; description?: unknown }>)
        .filter(f => f && typeof f.name === 'string')
        .map(f => ({ name: f.name as string, description: typeof f.description === 'string' ? f.description : '' }))
    : []

  const registry: BookingFieldDef[] = [
    { key: 'datetime', label: 'ISO datetime', required: true },
    { key: 'attendee_name', label: 'Attendee full name', required: true },
    { key: 'attendee_email', label: 'Attendee email address', required: true },
  ]

  if (requiredFields.includes('phone')) {
    registry.push({ key: 'attendee_phone', label: 'phone number', required: true })
  } else {
    registry.push({ key: 'attendee_phone', label: 'phone number', required: false })
  }
  if (requiredFields.includes('address')) {
    registry.push({ key: 'attendee_address', label: 'service address or appointment location', required: true })
  } else {
    registry.push({ key: 'attendee_address', label: 'service address or appointment location', required: false })
  }

  for (const cf of customFields) {
    const isReq = requiredFields.includes(`custom:${cf.name}`)
    registry.push({
      key: `custom_${cf.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      label: cf.description || cf.name,
      required: isReq,
      customName: cf.name,
    })
  }

  return registry
}

/**
 * Deterministic signature of a registry. Stored alongside tool IDs so a change
 * in required/custom fields triggers a recreate of the Vapi tool even when
 * CALENDAR_TOOL_VERSION hasn't moved.
 */
function computeBookingSignature(registry: BookingFieldDef[]): string {
  const stable = [
    'book-tool-payload:attendee_phone-attendee_address-custom_fields-aliases-v3',
    ...registry.map(f => `${f.key}:${f.required ? 'R' : 'O'}:${f.customName ?? ''}`),
  ].join('|')
  // simple non-crypto hash; collisions don't matter for cache busting.
  let h = 0
  for (let i = 0; i < stable.length; i++) h = ((h << 5) - h + stable.charCodeAt(i)) | 0
  return `${CALENDAR_TOOL_VERSION}-${(h >>> 0).toString(36)}`
}

async function liveBookAppointmentToolSupportsBookingFields(toolId?: string | null): Promise<boolean> {
  if (!toolId) return false

  try {
    const res = await fetch(`${VAPI_TOOL_URL}/${toolId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
    })

    if (!res.ok) {
      console.warn('Could not inspect live book_appointment tool; will recreate it', { toolId, status: res.status })
      return false
    }

    const tool = await res.json().catch(() => null)
    const code = typeof tool?.code === 'string' ? tool.code : ''
    const schema = JSON.stringify(tool?.function?.parameters || {})

    return code.includes('attendee_phone')
      && code.includes('attendee_address')
      && code.includes('custom_fields')
      && schema.includes('attendee_phone')
  } catch (error) {
    console.warn('Error inspecting live book_appointment tool; will recreate it', { toolId, error: String(error) })
    return false
  }
}

function buildAssistantCalendarTools(
  supabaseUrl: string,
  calendarSecret: string,
  assistantId: string,
  currentConfig: Record<string, unknown>
) {
  const calendarBookingConfig = currentConfig.calendar_booking && typeof currentConfig.calendar_booking === 'object'
    ? currentConfig.calendar_booking as Record<string, unknown>
    : {}
  const registry = buildBookingFieldRegistry(calendarBookingConfig)
  // PERMISSIVE schema: only the truly universal fields are required at the Vapi
  // schema layer. Required-field enforcement for phone/address/custom lives in
  // vapi-calendar-api, which can normalize spoken digits and return tool-friendly
  // retry instructions. Making the schema strict has caused the LLM to refuse
  // to invoke the tool at all when phone is required, blocking every booking.
  const requiredBookingParams = ['datetime', 'attendee_name', 'attendee_email']
  const requiredHumanList = registry
    .filter(f => f.required && !['datetime', 'attendee_name', 'attendee_email'].includes(f.key))
    .map(f => f.label)
  const customFieldParamMap = registry.reduce<Record<string, string>>((acc, field) => {
    if (field.customName) acc[field.key] = field.customName
    return acc
  }, {})
  const bookingProperties: Record<string, any> = {
    datetime: { type: 'string', description: 'ISO datetime for the appointment start time' },
    attendee_name: { type: 'string', description: 'Attendee full name' },
    attendee_email: { type: 'string', description: 'Attendee email address (required for the calendar invite)' },
    attendee_phone: { type: 'string', description: 'Attendee phone number in any caller-spoken format (digits, spaces, dashes, or spoken words). Always pass it here when the caller provides one, never in appointment_type or notes. The backend normalizes the format.' },
    phone: { type: 'string', description: 'Backward-compatible alias for attendee_phone. Prefer attendee_phone, but this is accepted when the model captured the caller phone as phone.' },
    phone_number: { type: 'string', description: 'Backward-compatible alias for attendee_phone. Prefer attendee_phone, but if the phone number is captured here the backend will normalize it.' },
    customer_phone: { type: 'string', description: 'Backward-compatible alias for attendee_phone. Prefer attendee_phone.' },
    customerPhone: { type: 'string', description: 'Backward-compatible alias for attendee_phone. Prefer attendee_phone.' },
    attendeePhone: { type: 'string', description: 'Backward-compatible alias for attendee_phone. Prefer attendee_phone.' },
    attendee_address: { type: 'string', description: 'Service address or appointment location. Always pass it here when collected, never in appointment_type.' },
    service_address: { type: 'string', description: 'Backward-compatible alias for attendee_address. Prefer attendee_address.' },
    address: { type: 'string', description: 'Backward-compatible alias for attendee_address. Prefer attendee_address.' },
    notes: { type: 'string', description: 'Optional notes from the caller. Do not use for phone or address unless the caller naturally provided them there; the backend may extract them defensively.' },
  }
  for (const field of registry) {
    if (field.customName && !bookingProperties[field.key]) {
      bookingProperties[field.key] = { type: 'string', description: `${field.label}. Custom booking field; pass it as ${field.key}.` }
    }
  }
  Object.assign(bookingProperties, {
    custom_fields: { type: 'object', description: 'Any extra booking fields collected from the caller, keyed by field name' },
    duration_minutes: { type: 'number', description: 'Duration in minutes' },
    appointment_type: { type: 'string', description: 'Optional service or appointment category only (e.g. consultation, estimate, repair). Never put phone numbers, email addresses, or service addresses in this field.' },
    timezone: { type: 'string', description: 'Caller timezone (IANA, e.g. America/New_York)' },
  })


  const checkAvailabilityCode = `
const { date, timezone = 'America/New_York', duration_minutes = 30 } = args;
const { SUPABASE_URL, CALENDAR_SECRET, ASSISTANT_ID } = env;

try {
  const res = await fetch(\`${'${SUPABASE_URL}'}/functions/v1/vapi-calendar-api\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vapi-secret': CALENDAR_SECRET,
    },
    body: JSON.stringify({
      action: 'check_availability',
      assistant_id: ASSISTANT_ID,
      date,
      timezone,
      duration_minutes,
    }),
  });

  const payload = await res.json().catch(() => ({ error: true, message: 'Calendar service error' }));
  if (!res.ok) return payload;
  return payload;
} catch (e) {
  return { error: true, message: 'Calendar service temporarily unavailable.' };
}`

  const bookAppointmentCode = `
const {
  datetime,
  attendee_name,
  attendee_email = null,
  attendee_phone = null,
  attendee_address = null,
  custom_fields = null,
  duration_minutes = 30,
  appointment_type = 'consultation',
  timezone = 'America/New_York',
} = args;
const { SUPABASE_URL, CALENDAR_SECRET, ASSISTANT_ID } = env;
const CUSTOM_FIELD_PARAM_MAP = ${JSON.stringify(customFieldParamMap)};

const stringifyValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }
  return String(value);
};

const normalizePhoneNumber = (...values) => {
  const digitWords = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
  const source = values.map(stringifyValue).filter(Boolean).join(' ');
  if (!source) return null;
  const wordNormalized = source
    .toLowerCase()
    .replace(/[a-z]+/g, (word) => digitWords[word] ?? ' ');
  const candidates = wordNormalized.match(/(?:\\+?\\d[\\s().-]*){10,15}/g) || [];
  const rawDigits = (candidates[0] || wordNormalized).replace(/\\D/g, '');
  if (rawDigits.length < 10) return null;
  const digits = rawDigits.startsWith('1') && rawDigits.length >= 11
    ? rawDigits.slice(0, 11)
    : rawDigits.slice(0, Math.min(rawDigits.length, 15));
  if (digits.length === 10) return '+1' + digits;
  if (digits.length >= 11 && digits.length <= 15) return '+' + digits;
  return null;
};

const inferAddressFromCombinedField = (value) => {
  const text = stringifyValue(value).trim();
  if (!text.includes(',') || !normalizePhoneNumber(text)) return null;
  const afterComma = text.split(',').slice(1).join(',').trim();
  return afterComma || null;
};

const normalizeAppointmentType = (value) => {
  const text = stringifyValue(value).trim();
  if (!text) return 'consultation';
  if (normalizePhoneNumber(text) || /@/.test(text)) return 'consultation';
  return text;
};

const normalizedCustomFields = custom_fields && typeof custom_fields === 'object' && !Array.isArray(custom_fields)
  ? { ...custom_fields }
  : {};
for (const [paramKey, fieldName] of Object.entries(CUSTOM_FIELD_PARAM_MAP)) {
  if (args[paramKey] !== undefined && args[paramKey] !== null && args[paramKey] !== '') {
    normalizedCustomFields[fieldName] = args[paramKey];
  }
}

const normalizedAttendeePhone = normalizePhoneNumber(
  attendee_phone,
  args.phone,
  args.phone_number,
  args.customer_phone,
  args.customerPhone,
  args.attendeePhone,
  args.appointment_type,
  args.notes,
  normalizedCustomFields
);
const normalizedAttendeeAddress = attendee_address || args.service_address || args.address || inferAddressFromCombinedField(args.appointment_type);
const normalizedAppointmentType = normalizeAppointmentType(appointment_type);

try {
  const idempotency_key = crypto.randomUUID();
  const res = await fetch(\`${'${SUPABASE_URL}'}/functions/v1/vapi-calendar-api\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vapi-secret': CALENDAR_SECRET,
    },
    body: JSON.stringify({
      action: 'book_appointment',
      assistant_id: ASSISTANT_ID,
      datetime,
      attendee_name,
      attendee_email,
      attendee_phone: normalizedAttendeePhone,
      attendee_address: normalizedAttendeeAddress,
      custom_fields: Object.keys(normalizedCustomFields).length > 0 ? normalizedCustomFields : null,
      duration_minutes,
      appointment_type: normalizedAppointmentType,
      timezone,
      idempotency_key,
    }),
  });

  const payload = await res.json().catch(() => ({ error: true, message: 'Booking service error' }));
  if (!res.ok) return payload;
  return payload;
} catch (e) {
  return { error: true, message: 'Booking service temporarily unavailable.' };
}`

  const getCurrentDatetimeCode = `
const { timezone = env.TIMEZONE_DEFAULT || 'America/New_York' } = args;

try {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const isoDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return {
    current_date: isoDate,
    day_of_week: get('weekday'),
    current_time: get('hour') + ':' + get('minute') + ':' + get('second') + ' ' + get('dayPeriod'),
    timezone,
    formatted: formatter.format(now),
  };
} catch (e) {
  return { error: true, message: 'Could not determine current date/time.' };
}`

  return {
    checkAvailabilityTool: {
      type: 'code',
      function: {
        name: 'check_availability',
        description: 'Check available appointment slots on a specific date. Returns available time slots for booking. Always call get_current_datetime first.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            timezone: { type: 'string', description: 'Timezone' },
            duration_minutes: { type: 'number', description: 'Duration in minutes' },
          },
          required: ['date'],
        },
      },
      code: checkAvailabilityCode,
      environmentVariables: [
        { name: 'SUPABASE_URL', value: supabaseUrl },
        { name: 'CALENDAR_SECRET', value: calendarSecret },
        { name: 'ASSISTANT_ID', value: assistantId },
      ],
    },
    bookAppointmentTool: {
      type: 'code',
      function: {
        name: 'book_appointment',
        description:
          `Book an appointment at a specific date and time. Use check_availability first. ` +
          `Accept the phone number exactly as the caller speaks it — do not ask them to repeat it in a specific format and never refuse a booking due to phone formatting; the system normalizes it server-side. ` +
          (requiredHumanList.length > 0
            ? `BEFORE calling this tool you MUST collect from the caller: ${requiredHumanList.join(', ')}. Never invoke book_appointment without these fields. `
            : ``) +
          `Always pass attendee_email; the booking backend uses it for the calendar invite.`,
        parameters: {
          type: 'object',
          properties: {
            ...bookingProperties,
          },
          required: requiredBookingParams,
        },
      },
      code: bookAppointmentCode,
      environmentVariables: [
        { name: 'SUPABASE_URL', value: supabaseUrl },
        { name: 'CALENDAR_SECRET', value: calendarSecret },
        { name: 'ASSISTANT_ID', value: assistantId },
      ],
    },

    getCurrentDatetimeTool: {
      type: 'code',
      function: {
        name: 'get_current_datetime',
        description: 'Get the current date, time, and day of the week. Call this whenever you need to know what day it is today.',
        parameters: {
          type: 'object',
          properties: {
            timezone: { type: 'string', description: 'Timezone' },
          },
          required: [],
        },
      },
      code: getCurrentDatetimeCode,
      environmentVariables: [{ name: 'TIMEZONE_DEFAULT', value: 'America/New_York' }],
    },
  }
}

async function deleteVapiTool(toolId?: string | null) {
  if (!toolId) return

  try {
    const res = await fetch(`${VAPI_TOOL_URL}/${toolId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
    })

    if (!res.ok) {
      console.warn('Failed to delete Vapi tool', { toolId, status: res.status })
    }
  } catch (error) {
    console.warn('Error deleting Vapi tool', { toolId, error: String(error) })
  }
}

async function upsertVapiTool(
  existingToolId: string | null | undefined,
  tool: any,
  _metadata?: Record<string, unknown>
): Promise<string> {
  const isUpdate = Boolean(existingToolId)
  // NOTE: Vapi rejects a top-level `metadata` property on tool create/update
  // ("property metadata should not exist"). We intentionally strip it here and
  // ignore any caller-supplied metadata. Agent<->tool ownership is tracked via
  // our DB (calendar_tools, agent_configs) and pruneAssistantStaleTools,
  // not via Vapi-side metadata tagging.
  const { metadata: _drop, ...toolClean } = (tool || {}) as Record<string, unknown>

  const res = await fetch(isUpdate ? `${VAPI_TOOL_URL}/${existingToolId}` : VAPI_TOOL_URL, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toolClean),
  })

  if (!res.ok) {
    throw new Error(`Tool ${isUpdate ? 'update' : 'creation'} failed: ${await res.text()}`)
  }

  const data = await res.json()
  return data.id
}

/**
 * Reconcile Vapi tools tagged with this agent's metadata.agent_id against
 * the set of tool IDs we expect to keep. Deletes anything that's tagged for
 * this agent but not in `expectedIds`. Best-effort: failures are logged
 * and swallowed so they don't block the main save flow.
 */
async function reconcileAgentTools(agentId: string, expectedIds: Array<string | null | undefined>) {
  const expected = new Set(expectedIds.filter((id): id is string => Boolean(id)))
  try {
    const res = await fetch(VAPI_TOOL_URL, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
    })
    if (!res.ok) {
      console.warn('reconcileAgentTools: list failed', { status: res.status })
      return
    }
    const tools = await res.json().catch(() => [])
    if (!Array.isArray(tools)) return

    const orphans = tools.filter((t: any) => {
      const metaAgent = t?.metadata?.agent_id
      return metaAgent === agentId && !expected.has(t.id)
    })

    if (orphans.length === 0) return
    console.log('reconcileAgentTools: deleting orphans', {
      agentId,
      orphanIds: orphans.map((t: any) => t.id),
    })
    await Promise.all(orphans.map((t: any) => deleteVapiTool(t.id)))
  } catch (err) {
    console.warn('reconcileAgentTools error', { err: String(err) })
  }
}

/**
 * After updating an assistant, fetch its current toolIds from Vapi and delete
 * any attached tool that we don't expect. This catches stale tools from older
 * code paths that have no `metadata.agent_id` tag (which would make
 * `reconcileAgentTools` skip them) but are still attached to the assistant
 * and being invoked by the LLM with the wrong schema.
 */
async function pruneAssistantStaleTools(assistantId: string, expectedIds: Array<string | null | undefined>) {
  const expected = new Set(expectedIds.filter((id): id is string => Boolean(id)))
  try {
    const res = await fetch(`${VAPI_API_URL}/${assistantId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
    })
    if (!res.ok) {
      console.warn('pruneAssistantStaleTools: assistant GET failed', { status: res.status })
      return
    }
    const assistant = await res.json().catch(() => null)
    const attached: string[] = Array.isArray(assistant?.model?.toolIds) ? assistant.model.toolIds : []
    const stale = attached.filter((id) => !expected.has(id))
    if (stale.length === 0) return

    console.log('pruneAssistantStaleTools: detaching + deleting stale tools', { assistantId, stale, expected: [...expected] })

    // Re-PATCH the assistant with only the expected toolIds so the LLM stops
    // seeing the stale schema immediately.
    try {
      const detachRes = await fetch(`${VAPI_API_URL}/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: { ...(assistant?.model || {}), toolIds: [...expected] } }),
      })
      if (!detachRes.ok) {
        console.warn('pruneAssistantStaleTools: detach PATCH failed', { status: detachRes.status, body: (await detachRes.text()).slice(0, 500) })
      }
    } catch (detachErr) {
      console.warn('pruneAssistantStaleTools: detach error', { err: String(detachErr) })
    }

    // Then delete the orphaned tools entirely.
    await Promise.all(stale.map((id) => deleteVapiTool(id)))
  } catch (err) {
    console.warn('pruneAssistantStaleTools error', { err: String(err) })
  }
}

async function ensureAssistantCalendarTools(
  assistantId: string,
  currentConfig: Record<string, unknown>,
  includeBookingTools: boolean,
  agentId: string
): Promise<{ toolIds: string[]; calendarToolConfig: CalendarToolConfig }> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || `https://${process.env.VITE_SUPABASE_PROJECT_ID || 'owzerqaududhfwngyqbp'}.supabase.co`
  const calendarSecret = process.env.VAPI_CALENDAR_SECRET || ''

  const missingVars = [
    !VAPI_API_KEY && 'VAPI_API_KEY',
    !supabaseUrl && 'SUPABASE_URL',
    !calendarSecret && 'VAPI_CALENDAR_SECRET',
  ].filter(Boolean)

  if (missingVars.length > 0) {
    const msg = `Missing Netlify env vars for tool registration: ${missingVars.join(', ')}`
    console.error(msg)
    throw new Error(msg)
  }

  const existingToolConfig = (currentConfig.calendar_tool_ids as CalendarToolConfig | undefined) || undefined
  const calendarBookingConfig = currentConfig.calendar_booking && typeof currentConfig.calendar_booking === 'object'
    ? (currentConfig.calendar_booking as Record<string, unknown>)
    : {}
  const registry = buildBookingFieldRegistry(calendarBookingConfig)
  const currentSignature = computeBookingSignature(registry)
  const liveToolHasBookingFields = await liveBookAppointmentToolSupportsBookingFields(existingToolConfig?.book_appointment_id)

  const versionMismatch = existingToolConfig?.version && existingToolConfig.version !== CALENDAR_TOOL_VERSION
  const signatureMismatch = existingToolConfig?.signature && existingToolConfig.signature !== currentSignature
  const missingBookingFields = includeBookingTools && !liveToolHasBookingFields
  const mustRecreate = Boolean(versionMismatch || signatureMismatch || missingBookingFields)

  if (mustRecreate) {
    console.log('Recreating calendar tools', { versionMismatch, signatureMismatch, missingBookingFields, currentSignature, stored: existingToolConfig?.signature })
    await Promise.all([
      deleteVapiTool(existingToolConfig?.check_availability_id),
      deleteVapiTool(existingToolConfig?.book_appointment_id),
      deleteVapiTool(existingToolConfig?.get_current_datetime_id),
    ])
  }

  const reusableToolConfig = mustRecreate ? undefined : existingToolConfig
  const { checkAvailabilityTool, bookAppointmentTool, getCurrentDatetimeTool } = buildAssistantCalendarTools(supabaseUrl, calendarSecret, assistantId, currentConfig)
  const toolMetadata = { agent_id: agentId, assistant_id: assistantId }

  const [checkAvailabilityId, bookAppointmentId, getCurrentDatetimeId] = await Promise.all([
    includeBookingTools
      ? upsertVapiTool(reusableToolConfig?.check_availability_id, checkAvailabilityTool, { ...toolMetadata, tool_kind: 'check_availability' })
      : Promise.resolve(reusableToolConfig?.check_availability_id || null),
    includeBookingTools
      ? upsertVapiTool(reusableToolConfig?.book_appointment_id, bookAppointmentTool, { ...toolMetadata, tool_kind: 'book_appointment' })
      : Promise.resolve(reusableToolConfig?.book_appointment_id || null),
    upsertVapiTool(reusableToolConfig?.get_current_datetime_id, getCurrentDatetimeTool, { ...toolMetadata, tool_kind: 'get_current_datetime' }),
  ])

  return {
    toolIds: [checkAvailabilityId, bookAppointmentId, getCurrentDatetimeId].filter(Boolean) as string[],
    calendarToolConfig: {
      version: CALENDAR_TOOL_VERSION,
      signature: currentSignature,
      check_availability_id: checkAvailabilityId,
      book_appointment_id: bookAppointmentId,
      get_current_datetime_id: getCurrentDatetimeId,
    },
  }
}


export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    }
  }

  // SECURITY: Authenticate the request
  const authResult = await authenticateRequest(event.headers.authorization)
  if (authResult.error || !authResult.user) {
    return unauthorizedResponse(authResult.error || 'Authentication required')
  }

  try {
    const { agentId, phoneNumber, action = 'create' } = JSON.parse(event.body || '{}')
    const requestId = `manage-vapi-${agentId || 'unknown'}-${Date.now()}`
    console.log('Starting Vapi assistant management process', { requestId, action, agentId, phoneNumber })
    
    if (!agentId) {
      throw new Error('Agent ID is required')
    }

    // SECURITY: Verify the authenticated user owns this agent
    const ownershipResult = await verifyAgentOwnership(authResult.user.id, agentId)
    if (!ownershipResult.owned) {
      return forbiddenResponse(ownershipResult.error || 'You do not have permission to modify this agent')
    }

    if (!VAPI_API_KEY) {
      throw new Error('VAPI_API_KEY is not configured')
    }

    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      console.error('Failed to fetch agent details:', agentError)
      throw new Error('Failed to fetch agent details')
    }

    const currentConfig = agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
      ? (agent.config as Record<string, unknown>)
      : {}

    // Check if calendar is enabled for this agent
    const { data: calendarTool } = await supabase
      .from('calendar_tools')
      .select('is_enabled')
      .eq('agent_id', agentId)
      .eq('tool_name', 'calendar_booking')
      .eq('is_enabled', true)
      .single()

    const isCalendarEnabled = Boolean(calendarTool)

    const vapiService = new VapiService(VAPI_API_KEY, VAPI_API_URL)

    if (action === 'delete') {
      const assistantId = getAssistantIdFromAgent(agent)
      const transferToolIdToDelete = (currentConfig.transfer_tool_id as string | null) || null
      const calendarCfg = currentConfig.calendar_tool_ids as CalendarToolConfig | undefined

      // Delete every tool we created for this agent first.
      await Promise.all([
        deleteVapiTool(transferToolIdToDelete),
        deleteVapiTool(calendarCfg?.check_availability_id),
        deleteVapiTool(calendarCfg?.book_appointment_id),
        deleteVapiTool(calendarCfg?.get_current_datetime_id),
      ])
      // Sweep anything else still tagged for this agent.
      await reconcileAgentTools(agentId, [])

      if (assistantId) {
        try {
          const delRes = await fetch(`${VAPI_API_URL}/${assistantId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
          })
          if (!delRes.ok && delRes.status !== 404) {
            console.warn('Failed to delete Vapi assistant', { assistantId, status: delRes.status })
          }
        } catch (err) {
          console.warn('Error deleting Vapi assistant', { assistantId, err: String(err) })
        }
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, deletedAssistantId: assistantId || null })
      }
    } else if (action === 'update') {
      const assistantId = getAssistantIdFromAgent(agent)
      if (!assistantId) {
        throw new Error('No VAPI assistant ID found for agent')
      }
      const shouldBackfillAssistantId = !agent.vapi_assistant_id

      // Handle transfer directory: reuse existing tool or create new one
      let transferToolId: string | null = null
      let transferToolError: string | null = null
      const existingTransferToolId = currentConfig.transfer_tool_id as string | null
      const hasTransferDirectory =
        agent.transfer_directory &&
        typeof agent.transfer_directory === 'object' &&
        Object.keys(agent.transfer_directory).length > 0
      let calendarToolIds: string[] = []
      let calendarToolConfig: CalendarToolConfig = {
        version: CALENDAR_TOOL_VERSION,
      }

      const buildAllToolIds = (calendarIds: string[]) => {
        const mergedToolIds = [...calendarIds]
        if (transferToolId) {
          mergedToolIds.push(transferToolId)
        }
        return mergedToolIds
      }

      if (hasTransferDirectory) {
        console.log('Processing transfer tool for directory:', agent.transfer_directory)
        try {
          // Delete old transfer tool first to prevent duplicates / stale refs
          if (existingTransferToolId) {
            console.log('Deleting old transfer tool:', existingTransferToolId)
            try {
              await fetch(`${VAPI_TOOL_URL}/${existingTransferToolId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
              })
            } catch (delErr) {
              console.warn('Failed to delete old transfer tool (may already be gone):', delErr)
            }
          }

          const toolData = await withRetry(() => vapiService.createTransferTool(
            agent.transfer_directory as Record<string, any>,
            { agent_id: agentId, assistant_id: assistantId, tool_kind: 'transfer' }
          ))
          transferToolId = toolData.id
          console.log('Created transfer tool:', { requestId, transferToolId })

          // Update config with new transfer tool ID
          await supabase
            .from('agent_configs')
            .update({
              config: {
                ...currentConfig,
                transfer_tool_id: transferToolId
              }
            })
            .eq('id', agentId)
        } catch (toolError: any) {
          console.error('Failed to create transfer tool:', toolError)
          transferToolError = String(toolError?.message || toolError)
          // Do NOT fall back to existingTransferToolId — it may be the dead one.
          transferToolId = null
        }
      } else if (existingTransferToolId) {
        // No directory configured — clean up any stale transfer tool reference
        // so we don't attach a deleted tool id to the assistant.
        console.log('No transfer directory; clearing stale transfer_tool_id:', existingTransferToolId)
        try {
          await fetch(`${VAPI_TOOL_URL}/${existingTransferToolId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
          })
        } catch (delErr) {
          console.warn('Failed to delete stale transfer tool (may already be gone):', delErr)
        }
        const { transfer_tool_id: _drop, ...restConfig } = currentConfig as Record<string, unknown>
        await supabase
          .from('agent_configs')
          .update({ config: restConfig })
          .eq('id', agentId)
      }

      const initialCalendarTools = await ensureAssistantCalendarTools(assistantId, currentConfig, isCalendarEnabled, agentId)
      calendarToolIds = initialCalendarTools.toolIds
      calendarToolConfig = initialCalendarTools.calendarToolConfig

      const vapiConfig = createVapiAssistantConfig(agent)
      let allToolIds = buildAllToolIds(calendarToolIds)

      if (allToolIds.length > 0) {
        vapiConfig.model.toolIds = allToolIds
        console.log('Setting model.toolIds on assistant:', allToolIds)
      }

      // Try PATCH, fall back to CREATE if assistant no longer exists
      let finalAssistantId = assistantId
      let actionTaken = 'updated'

      try {
        const updatedAssistant = await withRetry(async () => {
          const res = await fetch(`${VAPI_API_URL}/${assistantId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${VAPI_API_KEY}`,
              'Content-Type': 'application/json',
              'x-request-id': requestId,
            },
            body: JSON.stringify(vapiConfig),
          })
          if (!res.ok) {
            const errorText = await res.text()
            throw new Error(`VAPI update failed: ${errorText}`)
          }
          return res.json()
        })
        finalAssistantId = updatedAssistant.id
        console.log('Successfully updated Vapi assistant:', { requestId, updatedAssistantId: finalAssistantId, sentToolIds: allToolIds, returnedToolIds: updatedAssistant?.model?.toolIds })

        // Verification: ensure transferToolId actually landed on the assistant.
        // Sometimes Vapi returns 200 but silently drops a toolId if validation fails.
        if (transferToolId) {
          const returnedToolIds: string[] = Array.isArray(updatedAssistant?.model?.toolIds)
            ? updatedAssistant.model.toolIds
            : []
          if (!returnedToolIds.includes(transferToolId)) {
            console.warn('Transfer tool missing from assistant after PATCH, diagnosing + re-attaching', {
              requestId, transferToolId, returnedToolIds,
            })
            // Fetch the tool as Vapi stored it — exposes any schema-level rejection.
            try {
              const diagRes = await fetch(`${VAPI_TOOL_URL}/${transferToolId}`, {
                headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
              })
              const diagBody = await diagRes.text()
              console.warn('Transfer tool diagnostic GET', { requestId, status: diagRes.status, body: diagBody.slice(0, 2000) })
            } catch (diagErr) {
              console.warn('Transfer tool diagnostic GET failed', { requestId, diagErr: String(diagErr) })
            }
            try {
              const repatchBody = { model: { ...vapiConfig.model, toolIds: allToolIds } }
              const repatchRes = await fetch(`${VAPI_API_URL}/${finalAssistantId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${VAPI_API_KEY}`,
                  'Content-Type': 'application/json',
                  'x-request-id': `${requestId}-reattach`,
                },
                body: JSON.stringify(repatchBody),
              })
              if (!repatchRes.ok) {
                const errText = await repatchRes.text()
                console.error('Re-attach PATCH failed', { requestId, errText })
                transferToolError = `Vapi rejected transfer tool: ${errText.slice(0, 300)}`
              } else {
                const repatched = await repatchRes.json()
                const reToolIds: string[] = Array.isArray(repatched?.model?.toolIds) ? repatched.model.toolIds : []
                console.log('Re-attach toolIds result', { requestId, toolIds: reToolIds })
                if (!reToolIds.includes(transferToolId)) {
                  transferToolError = 'Vapi accepted the assistant update but dropped the transfer tool. Check the destination phone numbers (must be valid E.164) and try saving again.'
                }
              }
            } catch (reErr) {
              console.error('Re-attach error', { requestId, reErr: String(reErr) })
              transferToolError = String(reErr)
            }
          }
        }


      } catch (patchError: any) {
        const errorMsg = String(patchError?.message || '')
        if (errorMsg.includes("Couldn't Find") || errorMsg.includes('404') || errorMsg.includes('not found')) {
          console.warn(`Assistant ${assistantId} not found in VAPI, recreating...`, { requestId })
          
          // Create a brand-new assistant
          const newAssistant = await withRetry(() => vapiService.createAssistant(vapiConfig))
          finalAssistantId = newAssistant.id
          actionTaken = 'recreated'
          console.log('Successfully recreated Vapi assistant:', { requestId, oldId: assistantId, newId: finalAssistantId })

          const recreatedCalendarTools = await ensureAssistantCalendarTools(
            finalAssistantId,
            { ...currentConfig, calendar_tool_ids: calendarToolConfig },
            isCalendarEnabled,
            agentId
          )
          calendarToolIds = recreatedCalendarTools.toolIds
          calendarToolConfig = recreatedCalendarTools.calendarToolConfig
          allToolIds = buildAllToolIds(calendarToolIds)

          if (allToolIds.length > 0) {
            const recreatedAssistantConfig = createVapiAssistantConfig(agent)
            recreatedAssistantConfig.model.toolIds = allToolIds

            await withRetry(async () => {
              const res = await fetch(`${VAPI_API_URL}/${finalAssistantId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${VAPI_API_KEY}`,
                  'Content-Type': 'application/json',
                  'x-request-id': `${requestId}-tools`,
                },
                body: JSON.stringify(recreatedAssistantConfig),
              })

              if (!res.ok) {
                throw new Error(`VAPI recreate tool patch failed: ${await res.text()}`)
              }

              return res.json()
            })
          }

          // Re-import Twilio number if agent has one
          if (agent.phone_number && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
              await withRetry(() => vapiService.importTwilioNumber(
                finalAssistantId,
                agent.phone_number!,
                process.env.TWILIO_ACCOUNT_SID as string,
                process.env.TWILIO_AUTH_TOKEN as string
              ))
              console.log('Re-imported Twilio number to new assistant:', { requestId, phoneNumber: agent.phone_number })
            } catch (phoneErr) {
              console.error('Failed to re-import Twilio number:', phoneErr)
            }
          }
        } else {
          throw patchError
        }
      }

      // Update DB with the (possibly new) assistant ID
      if (finalAssistantId !== assistantId || shouldBackfillAssistantId) {
        const { error: updateIdError } = await supabase
          .from('agent_configs')
          .update({
            vapi_assistant_id: finalAssistantId,
            config: {
              ...currentConfig,
              vapi_assistant_id: finalAssistantId,
              transfer_tool_id: transferToolId || null,
              calendar_tool_ids: calendarToolConfig,
            }
          })
          .eq('id', agentId)

        if (updateIdError) {
          console.warn('Failed to update vapi_assistant_id', { requestId, finalAssistantId, updateIdError })
        }
      } else {
        const { error: updateToolsError } = await supabase
          .from('agent_configs')
          .update({
            config: {
              ...currentConfig,
              vapi_assistant_id: finalAssistantId,
              transfer_tool_id: transferToolId || null,
              calendar_tool_ids: calendarToolConfig,
            }
          })
          .eq('id', agentId)

        if (updateToolsError) {
          console.warn('Failed to update Vapi tool config', { requestId, updateToolsError })
        }
      }

      const expectedToolIds = [
        transferToolId,
        calendarToolConfig.check_availability_id,
        calendarToolConfig.book_appointment_id,
        calendarToolConfig.get_current_datetime_id,
      ]

      // Reconcile: delete any Vapi tools tagged with this agent that are no
      // longer in the expected set (orphans from failed prior saves).
      await reconcileAgentTools(agentId, expectedToolIds)

      // Prune: delete any tool still attached to the assistant that we don't
      // expect — catches untagged legacy tools that the LLM may still invoke.
      await pruneAssistantStaleTools(finalAssistantId, expectedToolIds)

      // Verify book_appointment is actually attached when calendar is enabled.
      let bookingToolError: string | null = null
      if (isCalendarEnabled && calendarToolConfig.book_appointment_id) {
        try {
          const verifyRes = await fetch(`${VAPI_API_URL}/${finalAssistantId}`, {
            headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
          })
          if (verifyRes.ok) {
            const verifyJson = await verifyRes.json()
            const attached: string[] = Array.isArray(verifyJson?.model?.toolIds) ? verifyJson.model.toolIds : []
            if (!attached.includes(calendarToolConfig.book_appointment_id)) {
              bookingToolError = 'Vapi did not attach the booking tool to the assistant. Re-save the agent; if the problem persists, check Vapi tool logs.'
            }
          }
        } catch (verErr) {
          console.warn('booking tool verify failed', { err: String(verErr) })
        }
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          assistantId: finalAssistantId,
          action: actionTaken,
          toolIds: allToolIds,
          transferToolId: transferToolId,
          transferAttached: Boolean(transferToolId),
          transferToolError,
          bookingToolError,
          hasTransferDirectory,
          calendarToolsAttached: calendarToolIds.length,
          globalToolsAvailable: calendarToolIds.length,
        })
      }
    } else {
      // Handle creation action
      // Create transfer tool if directory exists
      let transferToolId: string | null = null
      if (agent.transfer_directory && typeof agent.transfer_directory === 'object' && Object.keys(agent.transfer_directory).length > 0) {
        console.log('Creating transfer tool for directory:', agent.transfer_directory)
        try {
          const toolData = await withRetry(() => vapiService.createTransferTool(
            agent.transfer_directory as Record<string, any>,
            { agent_id: agentId, tool_kind: 'transfer' }
          ))
          transferToolId = toolData.id
          console.log('Created transfer tool:', { requestId, transferToolId })
        } catch (toolError) {
          console.error('Failed to create transfer tool during agent creation:', toolError)
          // Continue without transfer tool rather than failing entire creation
        }
      }

      // Create Vapi assistant first so calendar code tools can be bound to the final assistant ID
      const vapiConfig = createVapiAssistantConfig(agent)
      if (transferToolId) {
        vapiConfig.model.toolIds = [transferToolId]
        console.log('Setting initial model.toolIds on new assistant:', [transferToolId])
      }
      const vapiData = await withRetry(() => vapiService.createAssistant(vapiConfig))
      console.log('Successfully created Vapi assistant:', { requestId, assistantId: vapiData.id })

      const { toolIds: calendarToolIds, calendarToolConfig } = await ensureAssistantCalendarTools(
        vapiData.id,
        currentConfig,
        isCalendarEnabled,
        agentId
      )

      const allCreateToolIds = [...calendarToolIds]
      if (transferToolId) {
        allCreateToolIds.push(transferToolId)
      }

      if (allCreateToolIds.length > 0) {
        const updatedAssistantConfig = createVapiAssistantConfig(agent)
        updatedAssistantConfig.model.toolIds = allCreateToolIds

        await withRetry(async () => {
          const res = await fetch(`${VAPI_API_URL}/${vapiData.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${VAPI_API_KEY}`,
              'Content-Type': 'application/json',
              'x-request-id': `${requestId}-attach-tools`,
            },
            body: JSON.stringify(updatedAssistantConfig),
          })

          if (!res.ok) {
            throw new Error(`VAPI attach tool patch failed: ${await res.text()}`)
          }

          return res.json()
        })
      }

      // Import Twilio number if provided
      if (phoneNumber && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        await withRetry(() => vapiService.importTwilioNumber(
          vapiData.id,
          phoneNumber,
          process.env.TWILIO_ACCOUNT_SID as string,
          process.env.TWILIO_AUTH_TOKEN as string
        ))
      }

      // Update agent config with assistant and tool IDs
      const { error: updateError } = await supabase
        .from('agent_configs')
        .update({
          vapi_assistant_id: vapiData.id,
          config: {
            ...currentConfig,
            vapi_assistant_id: vapiData.id,
            transfer_tool_id: transferToolId,
            calendar_tool_ids: calendarToolConfig,
          }
        })
        .eq('id', agentId)

      if (updateError) {
        console.error('Error updating agent config:', updateError)
        throw updateError
      }

      console.log('Successfully updated agent config with Vapi assistant and tool IDs')

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          assistantId: vapiData.id,
          transferToolId: transferToolId,
          action: 'created'
        })
      }
    }
  } catch (error: any) {
    console.error('Error in manage-vapi-assistant:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message
      })
    }
  }
}
