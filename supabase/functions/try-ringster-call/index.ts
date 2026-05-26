import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const IP_LIMIT_PER_HOUR = 5;
const PHONE_LIMIT_PER_HOUR = 2;
const WINDOW_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('TRY_RINGSTER_WEBHOOK');
    if (!webhookUrl) {
      console.error('TRY_RINGSTER_WEBHOOK is not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { name, phone_number, company, website } = body ?? {};

    if (!name || typeof name !== 'string' || !phone_number || typeof phone_number !== 'string') {
      return new Response(
        JSON.stringify({ error: 'name and phone_number are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Phone format validation (E.164-ish): + followed by 8-15 digits
    const cleanPhone = phone_number.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (name.length > 100 || (company && company.length > 200) || (website && website.length > 500)) {
      return new Response(
        JSON.stringify({ error: 'Input exceeds maximum length' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Derive caller IP
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();

    // Check IP-based limit
    const { count: ipCount, error: ipErr } = await supabase
      .from('try_ringster_call_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', sinceIso);

    if (ipErr) console.error('IP rate-limit query error', ipErr);

    if ((ipCount ?? 0) >= IP_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check phone-based limit
    const { count: phoneCount, error: phoneErr } = await supabase
      .from('try_ringster_call_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('phone_number', cleanPhone)
      .gte('created_at', sinceIso);

    if (phoneErr) console.error('Phone rate-limit query error', phoneErr);

    if ((phoneCount ?? 0) >= PHONE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: 'This number has already been called recently. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Log the attempt BEFORE making the call (fail-closed)
    const { error: insertErr } = await supabase
      .from('try_ringster_call_rate_limits')
      .insert({ ip_address: ip, phone_number: cleanPhone });

    if (insertErr) console.error('Rate-limit insert error', insertErr);

    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone_number: cleanPhone, company, website }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error('Upstream webhook failed', upstream.status, text);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate call' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, upstream: text.slice(0, 500) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('try-ringster-call error', err);
    return new Response(
      JSON.stringify({ error: 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
