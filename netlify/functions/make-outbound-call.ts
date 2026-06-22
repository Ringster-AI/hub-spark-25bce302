
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { createVapiAssistantConfig } from './services/vapi-config';
import { authenticateRequest, corsHeaders, unauthorizedResponse, forbiddenResponse } from './utils/auth';
import { summarizeForLog } from './utils/redact';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID!;
const twilioAuthToken = (process.env["TWILIO_AUTH_TOKEN"] ?? process.env["TWILIO_AUTH _TOKEN"])!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handler: Handler = async (event) => {
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // SECURITY: Authenticate the request
  const authResult = await authenticateRequest(event.headers.authorization);
  if (authResult.error || !authResult.user) {
    return unauthorizedResponse(authResult.error || 'Authentication required');
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { user, assistant } = payload;

    if (!assistant || !user || !user.phoneNumber) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required parameters' }),
      };
    }

    // Get agent details from database to get the phone number
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('name', assistant.name)
      .single();

    if (agentError || !agentData) {
      console.error('Error fetching agent:', agentError);
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Agent not found' }),
      };
    }

    // SECURITY: Verify the authenticated user owns this agent
    if (agentData.user_id !== authResult.user.id) {
      return forbiddenResponse('You do not have permission to use this agent');
    }

    // Use fixed outbound number to save costs
    const fixedOutboundNumber = '+16204458363';

    // Get the webhook URL from environment variable
    const outboundCallWebhook = process.env.OUTBOUND_CALL_WEBHOOK;
    if (!outboundCallWebhook) {
      throw new Error('OUTBOUND_CALL_WEBHOOK is not configured');
    }

    // Format the payload for Vapi - pass through all customer metadata
    const vapiPayload = {
      assistant: {
        ...createVapiAssistantConfig(agentData),
        firstMessageMode: "assistant-speaks-first",
      },
      phoneNumber: {
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber: fixedOutboundNumber
      },
      customer: {
        number: user.phoneNumber,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        ...user.metadata // Include all metadata from the CSV directly
      },
      phoneNumberId: undefined // Using shared number, no specific SID needed
    };

    console.log('Making outbound call with payload:', summarizeForLog(vapiPayload));

    // Send POST request to webhook
    const response = await fetch(outboundCallWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vapiPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook error response:', errorText);
      throw new Error(`Webhook responded with status: ${response.status}`);
    }

    const webhookResponse = await response.json();
    console.log('Webhook response:', webhookResponse);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Call initiated successfully',
        ...webhookResponse,
      }),
    };
  } catch (error) {
    console.error('Error making outbound call:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to initiate call' }),
    };
  }
};
