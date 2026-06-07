
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

// Module-scoped service client — reused across requests in the same isolate.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { headers: corsHeaders, status: 500 }
      )
    }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { headers: corsHeaders, status: 401 }
      )
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser(token)

    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: corsHeaders, status: 401 }
      )
    }

    const userId = claimsData.user.id

    // Use service role client for data queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Fetching subscription data for user:', userId)
    
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        user_id,
        status,
        plan_id,
        current_period_start,
        current_period_end,
        plan:subscription_plans (
          name,
          price,
          minutes_allowance,
          max_agents,
          max_team_members
        )
      `)
      .eq('user_id', userId)
      .maybeSingle()
    
    if (subscriptionError) {
      console.error('Subscription query error:', subscriptionError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscription data' }),
        { headers: corsHeaders, status: 500 }
      )
    }
    
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, name, minutes_used, total_minutes_used')
      .eq('user_id', userId)
    
    if (agentError) {
      console.error('Agent query error:', agentError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch agent data' }),
        { headers: corsHeaders, status: 500 }
      )
    }
    
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    
    const { data: usageSummary, error: usageError } = await supabase
      .from('usage_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .maybeSingle()
    
    if (usageError) {
      console.error('Usage summary query error:', usageError)
    }
    
    const responseData = {
      subscription: subscriptionData,
      agents: agentData || [],
      monthlySummary: usageSummary
    }
    
    console.log('Successfully fetched data for user:', userId)
    
    return new Response(
      JSON.stringify(responseData),
      { headers: corsHeaders, status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error in get-usage-data:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: corsHeaders, status: 500 }
    )
  }
})
