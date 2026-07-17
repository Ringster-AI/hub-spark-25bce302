import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { authenticateRequest, corsHeaders, unauthorizedResponse, forbiddenResponse } from './utils/auth'

const VAPI_API_KEY = process.env.VAPI_API_KEY!
const VAPI_BASE_URL = 'https://api.vapi.ai'

const ALLOWED_KINDS = new Set([
  'mono-recording',
  'stereo-recording',
  'customer-recording',
  'assistant-recording',
  'video-recording',
  'call-logs',
  'pcap',
])

const admin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

/**
 * Returns a short-lived signed URL for a Vapi call recording.
 *
 * Vapi has removed public access to `storage.vapi.ai` recording URLs.
 * The frontend must call this function with a `call_log_id`, we verify the
 * caller owns the underlying agent, then hit
 * `GET https://api.vapi.ai/call/{vapiCallId}/{kind}` with our API key.
 * Vapi 302-redirects to a signed, short-lived URL, which we return to the
 * browser so <audio> / <a download> can fetch it directly.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const authResult = await authenticateRequest(event.headers.authorization)
  if (authResult.error || !authResult.user) {
    return unauthorizedResponse(authResult.error || 'Authentication required')
  }

  if (!VAPI_API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'VAPI_API_KEY is not configured' }),
    }
  }

  let callLogId: string | undefined
  let kind = 'mono-recording'
  try {
    const body = JSON.parse(event.body || '{}')
    callLogId = body.call_log_id
    if (typeof body.kind === 'string' && ALLOWED_KINDS.has(body.kind)) {
      kind = body.kind
    }
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  if (!callLogId || typeof callLogId !== 'string') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'call_log_id is required' }),
    }
  }

  // Look up the call and verify ownership through the owning agent.
  const { data: callLog, error: callErr } = await admin
    .from('call_logs')
    .select('call_sid, agent_id, agent_configs!inner(user_id)')
    .eq('id', callLogId)
    .maybeSingle()

  if (callErr || !callLog) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Call not found' }),
    }
  }

  const ownerId = (callLog as any).agent_configs?.user_id
  if (ownerId !== authResult.user.id) {
    return forbiddenResponse('You do not have permission to access this recording')
  }

  const vapiCallId = (callLog as any).call_sid as string | null
  if (!vapiCallId) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Recording not available for this call' }),
    }
  }

  try {
    // Vapi returns a 302 to a signed URL. We must NOT follow it — we want the
    // Location header so we can hand the signed URL back to the browser.
    const upstream = await fetch(`${VAPI_BASE_URL}/call/${vapiCallId}/${kind}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      redirect: 'manual',
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) {
        return {
          statusCode: 502,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Vapi did not return a signed URL' }),
        }
      }
      // Consume the body to release the connection.
      await upstream.arrayBuffer().catch(() => {})
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ url: location, kind }),
      }
    }

    // Some kinds (e.g. call-logs, pcap for missing artifacts) can return 404.
    const errorText = await upstream.text().catch(() => '')
    console.error(`Vapi recording fetch failed [${upstream.status}]: ${errorText}`)
    return {
      statusCode: upstream.status,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to retrieve recording from Vapi',
        status: upstream.status,
        details: errorText,
      }),
    }
  } catch (err: any) {
    console.error('get-vapi-recording error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err?.message || 'Unexpected error' }),
    }
  }
}
