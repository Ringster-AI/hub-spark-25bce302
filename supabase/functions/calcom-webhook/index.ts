import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cal-signature-256',
};

/**
 * Cal.com webhook handler.
 * Subscribes to: BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED
 * Docs: https://cal.com/docs/core-features/webhooks
 *
 * Configure your Cal.com webhook to POST here:
 *   https://<project>.supabase.co/functions/v1/calcom-webhook
 *
 * Requires CALCOM_WEBHOOK_SECRET env var matching the secret configured in Cal.com.
 */

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const secret = Deno.env.get('CALCOM_WEBHOOK_SECRET');
  if (!secret) {
    console.error('CALCOM_WEBHOOK_SECRET is not configured');
    return new Response(JSON.stringify({ error: 'Webhook misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Read raw body for signature verification
    const rawBody = await req.text();
    const providedSig = (req.headers.get('x-cal-signature-256') || '').trim().toLowerCase();
    const expectedSig = (await hmacSha256Hex(secret, rawBody)).toLowerCase();

    if (!providedSig || !timingSafeEqual(providedSig, expectedSig)) {
      console.warn('Cal.com webhook signature verification failed');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = JSON.parse(rawBody);
    const triggerEvent: string = payload.triggerEvent;
    const data = payload.payload || {};

    console.log('Cal.com webhook:', triggerEvent, JSON.stringify(data).slice(0, 500));

    const externalId = String(data.uid || data.id || '');
    const startTime = data.startTime;
    const endTime = data.endTime;
    const attendee = (data.attendees && data.attendees[0]) || {};

    if (!externalId) {
      return new Response(JSON.stringify({ error: 'Missing booking identifier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (triggerEvent === 'BOOKING_CANCELLED') {
      await supabase
        .from('calendar_bookings')
        .update({ booking_status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('provider', 'calcom')
        .eq('external_booking_id', externalId);

      return new Response(JSON.stringify({ ok: true, action: 'cancelled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (triggerEvent === 'BOOKING_CREATED' || triggerEvent === 'BOOKING_RESCHEDULED') {
      const { data: existing } = await supabase
        .from('calendar_bookings')
        .select('id')
        .eq('provider', 'calcom')
        .eq('external_booking_id', externalId)
        .maybeSingle();

      const baseFields = {
        booking_status: 'confirmed',
        appointment_datetime: startTime,
        attendee_email: attendee.email || null,
        attendee_name: attendee.name || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from('calendar_bookings').update(baseFields).eq('id', existing.id);
      } else if (startTime) {
        await supabase.from('calendar_bookings').insert({
          ...baseFields,
          provider: 'calcom',
          external_booking_id: externalId,
          booking_source: 'external',
          metadata: { raw: data, end_time: endTime },
        });
      }

      return new Response(JSON.stringify({ ok: true, action: 'confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: triggerEvent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Cal.com webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
