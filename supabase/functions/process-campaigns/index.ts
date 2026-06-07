import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Module-scoped service client — reused across requests in the same isolate.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);


interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduled_start: string | null;
  config: any;
  agent_id: string;
  phone_number?: string;
}

interface Contact {
  id: string;
  campaign_id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  status: string;
  call_attempts: number;
  last_call_at: string | null;
  metadata: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Processing campaign contacts...');


    // Get campaigns that need processing
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select(`
        id,
        name,
        status,
        scheduled_start,
        config,
        agent_id,
        agent_configs!inner(phone_number)
      `)
      .or('status.eq.running,and(status.eq.scheduled,scheduled_start.lte.' + new Date().toISOString() + ')');

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns ready for processing');
      return new Response(
        JSON.stringify({ message: 'No campaigns to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process campaigns in parallel (each campaign is independent).
    const campaignResults = await Promise.all(
      campaigns.map(async (campaign) => {
        console.log(`Processing campaign: ${campaign.name} (${campaign.id})`);

        // Update scheduled campaigns to running
        if (campaign.status === 'scheduled') {
          await supabase
            .from('campaigns')
            .update({ status: 'running' })
            .eq('id', campaign.id);
          console.log(`Campaign ${campaign.id} updated to running status`);
        }

        // Pull a larger batch now that contacts are processed concurrently.
        const { data: contacts, error: contactsError } = await supabase
          .from('campaign_contacts')
          .select('*')
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')
          .lt('call_attempts', 3)
          .or('last_call_at.is.null,last_call_at.lte.' + new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(50);

        if (contactsError) {
          console.error(`Error fetching contacts for campaign ${campaign.id}:`, contactsError);
          return 0;
        }

        if (!contacts || contacts.length === 0) {
          console.log(`No contacts to process for campaign ${campaign.id}`);
          return 0;
        }

        const config = campaign.config || {};
        const businessHours = config.businessHours || {
          start: '09:00',
          end: '17:00',
          timezone: 'America/New_York',
          days: [1, 2, 3, 4, 5]
        };

        if (!isWithinBusinessHours(businessHours)) {
          console.log(`Outside business hours for campaign ${campaign.id}, skipping`);
          return 0;
        }

        // Bounded concurrency across contacts within a single campaign.
        const CONCURRENCY = 5;
        let cursor = 0;
        let processed = 0;

        const worker = async () => {
          while (cursor < contacts.length) {
            const idx = cursor++;
            const contact = contacts[idx];
            try {
              const success = await makeOutboundCall(campaign, contact);
              await supabase
                .from('campaign_contacts')
                .update({
                  status: success ? 'called' : 'pending',
                  call_attempts: contact.call_attempts + 1,
                  last_call_at: new Date().toISOString()
                })
                .eq('id', contact.id);
              processed++;
              console.log(`Processed contact ${contact.id}: ${success ? 'success' : 'failed'}`);
            } catch (error) {
              console.error(`Failed to process contact ${contact.id}:`, error);
              await supabase
                .from('campaign_contacts')
                .update({
                  call_attempts: contact.call_attempts + 1,
                  last_call_at: new Date().toISOString()
                })
                .eq('id', contact.id);
            }
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, contacts.length) }, () => worker())
        );

        return processed;
      })
    );

    const totalProcessed = campaignResults.reduce((a, b) => a + b, 0);

    console.log(`Campaign processing complete. Total processed: ${totalProcessed}`);

    return new Response(
      JSON.stringify({ 
        message: 'Campaign processing complete',
        campaigns: campaigns.length,
        processed: totalProcessed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Campaign processing error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function isWithinBusinessHours(businessHours: any): boolean {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  // Check if current day is in business days
  if (!businessHours.days.includes(currentDay)) {
    return false;
  }
  
  // Check if current time is within business hours
  if (currentTime < businessHours.start || currentTime > businessHours.end) {
    return false;
  }
  
  return true;
}

async function makeOutboundCall(campaign: any, contact: Contact): Promise<boolean> {
  const outboundWebhookUrl = Deno.env.get('OUTBOUND_CALL_WEBHOOK');
  
  if (!outboundWebhookUrl) {
    console.error('OUTBOUND_CALL_WEBHOOK not configured');
    return false;
  }

  // Use fixed outbound number to save costs
  const fixedOutboundNumber = '+16204458363';

  const payload = {
    assistant: {
      name: campaign.name,
      description: campaign.config?.goalDescription || 'Outbound sales call',
      firstMessageMode: 'assistant-speaks-first'
    },
    phoneNumber: {
      twilioPhoneNumber: fixedOutboundNumber
    },
    customer: {
      number: contact.phone_number,
      firstName: contact.first_name,
      lastName: contact.last_name,
      ...contact.metadata
    },
    campaignId: campaign.id,
    contactId: contact.id
  };

  try {
    const response = await fetch(outboundWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Outbound call failed: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log('Outbound call initiated:', result);
    return true;

  } catch (error) {
    console.error('Error making outbound call:', error);
    return false;
  }
}