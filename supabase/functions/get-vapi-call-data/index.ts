import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers: jsonHeaders }
    )
  }

  try {
    // --- Authentication: require a valid signed-in user ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }
    const token = authHeader.replace('Bearer ', '')
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: userData, error: userError } = await authClient.auth.getUser(token)
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }
    const userId = userData.user.id

    const { callId, action } = await req.json()

    if (!callId || typeof callId !== 'string' || callId.length > 128) {
      return new Response(JSON.stringify({ error: 'A valid call ID is required' }), { status: 400, headers: jsonHeaders })
    }

    if (action !== 'transcript' && action !== 'recording') {
      return new Response(
        JSON.stringify({ error: 'Invalid action specified. Use "transcript" or "recording"' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY')
    if (!VAPI_API_KEY) {
      console.error('VAPI_API_KEY is not configured')
      return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 500, headers: jsonHeaders })
    }

    // --- Authorization: the call must belong to an agent owned by this user ---
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: callLog } = await admin
      .from('call_logs')
      .select('id, agent_id, agent_configs!inner(user_id)')
      .eq('call_sid', callId)
      .maybeSingle()

    const ownerId = (callLog as any)?.agent_configs?.user_id
    if (!callLog || !ownerId) {
      return new Response(JSON.stringify({ error: 'Call not found' }), { status: 404, headers: jsonHeaders })
    }
    if (ownerId !== userId) {
      return new Response(
        JSON.stringify({ error: 'You do not have permission to access this call data' }),
        { status: 403, headers: jsonHeaders }
      )
    }

    const apiUrl = `https://api.vapi.ai/call/${encodeURIComponent(callId)}/${action}`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`VAPI API error: ${response.status} ${errorText}`)
      return new Response(JSON.stringify({ error: 'Unable to retrieve call data' }), { status: 502, headers: jsonHeaders })
    }

    const result = await response.json()

    return new Response(JSON.stringify(result), { headers: jsonHeaders })
  } catch (error) {
    console.error('Error in get-vapi-call-data:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders })
  }
})
