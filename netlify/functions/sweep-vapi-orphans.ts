import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { authenticateRequest, corsHeaders, unauthorizedResponse, forbiddenResponse } from './utils/auth'

const VAPI_API_KEY = process.env.VAPI_API_KEY!
const VAPI_TOOL_URL = 'https://api.vapi.ai/tool'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

type SweepResult = {
  total: number
  kept: number
  deleted: number
  failed: number
  dryRun: boolean
  deletedIds: string[]
  failedIds: Array<{ id: string; error: string }>
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const auth = await authenticateRequest(event.headers.authorization)
  if (auth.error || !auth.user) return unauthorizedResponse(auth.error || 'Auth required')

  // Super-admin only
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_super_admin', { _user_id: auth.user.id })
  if (adminErr || !isAdmin) return forbiddenResponse('Super admin required')

  if (!VAPI_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'VAPI_API_KEY missing' }) }
  }

  const { dryRun = true } = JSON.parse(event.body || '{}') as { dryRun?: boolean }

  // Collect every tool ID currently referenced by any agent_configs row.
  const { data: agents, error: agentsErr } = await supabase
    .from('agent_configs')
    .select('id, config')
  if (agentsErr) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: agentsErr.message }) }
  }

  const referenced = new Set<string>()
  for (const a of agents || []) {
    const cfg = (a.config && typeof a.config === 'object' && !Array.isArray(a.config))
      ? a.config as Record<string, any>
      : {}
    if (typeof cfg.transfer_tool_id === 'string') referenced.add(cfg.transfer_tool_id)
    const cal = cfg.calendar_tool_ids
    if (cal && typeof cal === 'object') {
      for (const k of ['check_availability_id', 'book_appointment_id', 'get_current_datetime_id']) {
        const v = (cal as any)[k]
        if (typeof v === 'string') referenced.add(v)
      }
    }
  }

  // List every Vapi tool
  const listRes = await fetch(VAPI_TOOL_URL, {
    headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
  })
  if (!listRes.ok) {
    const t = await listRes.text()
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: `Vapi list failed: ${t}` }) }
  }
  const tools = await listRes.json().catch(() => [])
  if (!Array.isArray(tools)) {
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'Unexpected Vapi response' }) }
  }

  const orphans = tools.filter((t: any) => {
    const id = t?.id
    if (!id || typeof id !== 'string') return false
    if (referenced.has(id)) return false
    // Only sweep tool kinds we own.
    const type = t?.type
    return type === 'transferCall' || type === 'code'
  })

  const result: SweepResult = {
    total: tools.length,
    kept: tools.length - orphans.length,
    deleted: 0,
    failed: 0,
    dryRun,
    deletedIds: [],
    failedIds: [],
  }

  if (dryRun) {
    result.deletedIds = orphans.map((o: any) => o.id)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
  }

  await Promise.all(orphans.map(async (o: any) => {
    try {
      const r = await fetch(`${VAPI_TOOL_URL}/${o.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
      })
      if (r.ok || r.status === 404) {
        result.deleted++
        result.deletedIds.push(o.id)
      } else {
        result.failed++
        result.failedIds.push({ id: o.id, error: `${r.status}` })
      }
    } catch (e: any) {
      result.failed++
      result.failedIds.push({ id: o.id, error: String(e?.message || e) })
    }
  }))

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
}
