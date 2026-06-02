
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPI_SERVER_MESSAGES = [
  'status-update',
  'transcript',
  'end-of-call-report',
];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agentId, action } = await req.json();
    console.log('Managing VAPI assistant:', { agentId, action });

    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const callerUserId = userData.user.id;

    // Get agent configuration
    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      throw new Error(`Failed to fetch agent: ${agentError?.message}`);
    }

    // Verify ownership
    if (agent.user_id !== callerUserId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: you do not own this agent', success: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapiApiKey = Deno.env.get('VAPI_API_KEY');
    if (!vapiApiKey) {
      console.log('VAPI API key not configured, skipping VAPI sync');
      return new Response(
        JSON.stringify({ success: true, message: 'VAPI sync skipped - API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let vapiResponse;
    let vapiConfig;

    if (action === 'update' || action === 'create') {
      // Create the correct VAPI assistant configuration
      const vapiServerSecret = Deno.env.get('VAPI_SERVER_SECRET');
      vapiConfig = {
        name: agent.name,
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: agent.description || 'You are a helpful AI assistant.'
            }
          ]
        },
        voice: {
          provider: '11labs',
          voiceId: agent.voice_id || '21m00Tcm4TlvDq8ikWAM',
        },
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        firstMessage: agent.greeting || 'Hello! How can I help you today?',
        endCallMessage: agent.goodbye || 'Thank you for calling. Have a great day!',
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600,
        server: {
          url: `${supabaseUrl}/functions/v1/vapi-webhook`,
          ...(vapiServerSecret ? { secret: vapiServerSecret } : {}),
        },
        serverMessages: VAPI_SERVER_MESSAGES,
        metadata: {
          agent_id: agent.id,
          user_id: agent.user_id,
        },
      };

      console.log('VAPI Configuration:', JSON.stringify(vapiConfig, null, 2));
    }

    if (action === 'update') {
      // Check if assistant already exists
      if (agent.vapi_assistant_id) {
        // Update existing assistant
        console.log('Updating existing VAPI assistant:', agent.vapi_assistant_id);
        vapiResponse = await fetch(`https://api.vapi.ai/assistant/${agent.vapi_assistant_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(vapiConfig),
        });
      } else {
        // Create new assistant if none exists
        console.log('Creating new VAPI assistant');
        vapiResponse = await fetch('https://api.vapi.ai/assistant', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(vapiConfig),
        });
      }
    } else if (action === 'create') {
      // Create new assistant
      console.log('Creating new VAPI assistant');
      vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vapiConfig),
      });
    } else if (action === 'delete' && agent.vapi_assistant_id) {
      // Delete assistant
      console.log('Deleting VAPI assistant:', agent.vapi_assistant_id);
      vapiResponse = await fetch(`https://api.vapi.ai/assistant/${agent.vapi_assistant_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
        },
      });
    }

    if (vapiResponse && !vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      console.error('VAPI API error:', errorText);
      throw new Error(`VAPI API error: ${errorText}`);
    }

    let vapiData = null;
    if (vapiResponse && vapiResponse.headers.get('content-type')?.includes('application/json')) {
      vapiData = await vapiResponse.json();
      console.log('VAPI response:', vapiData);
    }

    // Update agent with VAPI assistant ID if we created/updated one
    if ((action === 'update' || action === 'create') && vapiData?.id) {
      const { error: updateError } = await supabase
        .from('agent_configs')
        .update({ 
          vapi_assistant_id: vapiData.id,
          config: {
            ...agent.config,
            vapi_assistant_id: vapiData.id
          }
        })
        .eq('id', agentId);

      if (updateError) {
        console.error('Failed to update agent with VAPI ID:', updateError);
      }
    } else if (action === 'delete') {
      // Clear VAPI assistant ID
      const { error: updateError } = await supabase
        .from('agent_configs')
        .update({ 
          vapi_assistant_id: null,
          config: {
            ...agent.config,
            vapi_assistant_id: null
          }
        })
        .eq('id', agentId);

      if (updateError) {
        console.error('Failed to clear VAPI ID from agent:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: vapiData,
        message: `Successfully ${action}d VAPI assistant`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error managing VAPI assistant:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
