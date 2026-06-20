import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, calendly-webhook-signature',
};

/**
 * Calendly webhook handler.
 * Subscribes to: invitee.created, invitee.canceled
 * Docs: https://developer.calendly.com/api-docs/ZG9jOjE2OTAyMTYy-webhook-subscriptions
 *
 * Configure your Calendly webhook to POST here:
 *   https://<project>.supabase.co/functions/v1/calendly-webhook
 *
 * Requires CALENDLY_WEBHOOK_SIGNING_KEY env var matching the signing key Calendly provides
 * when you create the webhook subscription.
 */

const TOLERANCE_SECONDS = 5 * 60;

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

  const signingKey = Deno.env.get('CALENDLY_WEBHOOK_SIGNING_KEY');
  if (!signingKey) {
    console.error('CALENDLY_WEBHOOK_SIGNING_KEY is not configured');
    return new Response(JSON.stringify({ error: 'Webhook misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('calendly-webhook-signature') || '';

    // Header format: t=<unix_ts>,v1=<hex_hmac>
    const parts = Object.fromEntries(
      sigHeader.split(',').map((kv) => {
        const [k, ...rest] = kv.trim().split('=');
        return [k, rest.join('=')];
      }),
    );
    const ts = parts['t'];
    const receivedSig = (parts['v1'] || '').toLowerCase();

    if (!ts || !receivedSig) {
      console.warn('Calendly webhook missing signature header');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_SECONDS) {
      console.warn('Calendly webhook timestamp outside tolerance');
      return new Response(JSON.stringify({ error: 'Stale signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expectedSig = (await hmacSha256Hex(signingKey, `${ts}.${rawBody}`)).toLowerCase();
    if (!timingSafeEqual(receivedSig, expectedSig)) {
      console.warn('Calendly webhook signature mismatch');
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
    const event = payload.event as string; // e.g. "invitee.created" / "invitee.canceled"
    const resource = payload.payload || {};

    console.log('Calendly webhook:', event, JSON.stringify(resource).slice(0, 500));

    const inviteeUri: string | undefined = resource.uri;
    const eventUri: string | undefined = resource.event;
    const startTime: string | undefined = resource.scheduled_event?.start_time || resource.start_time;
    const endTime: string | undefined = resource.scheduled_event?.end_time || resource.end_time;
    const inviteeEmail: string | undefined = resource.email;
    const inviteeName: string | undefined = resource.name;
    const externalId = inviteeUri || eventUri;

    if (!externalId) {
      return new Response(JSON.stringify({ error: 'Missing booking identifier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event === 'invitee.canceled') {
      const { error } = await supabase
        .from('calendar_bookings')
        .update({
          booking_status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'calendly')
        .eq('external_booking_id', externalId);

      if (error) console.error('Failed to mark Calendly booking cancelled:', error);

      return new Response(JSON.stringify({ ok: true, action: 'cancelled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event === 'invitee.created') {
      const { data: existing } = await supabase
        .from('calendar_bookings')
        .select('id')
        .eq('provider', 'calendly')
        .eq('external_booking_id', externalId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('calendar_bookings')
          .update({
            booking_status: 'confirmed',
            appointment_datetime: startTime,
            attendee_email: inviteeEmail,
            attendee_name: inviteeName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else if (startTime) {
        await supabase.from('calendar_bookings').insert({
          provider: 'calendly',
          external_booking_id: externalId,
          booking_status: 'confirmed',
          booking_source: 'external',
          appointment_datetime: startTime,
          attendee_email: inviteeEmail,
          attendee_name: inviteeName,
          metadata: { raw: resource, event_uri: eventUri, end_time: endTime },
        });
      }

      return new Response(JSON.stringify({ ok: true, action: 'confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Calendly webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
