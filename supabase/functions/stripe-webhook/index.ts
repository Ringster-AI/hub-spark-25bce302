import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No Stripe signature found');
    }

    const body = await req.text();
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
      );
    } catch (err) {
      console.error(`⚠️ Webhook signature verification failed.`, err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`🔔 Event received: ${event.type}`);

    // Helper: fire-and-forget transactional email
    async function sendEmail(templateName: string, recipientEmail: string, idempotencyKey: string, templateData: Record<string, unknown> = {}) {
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: { templateName, recipientEmail, idempotencyKey, templateData },
        });
      } catch (e) {
        console.error(`sendEmail ${templateName} failed`, e);
      }
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const previousAttributes = (event.data as any).previous_attributes ?? {};
        const customerId = subscription.customer;
        const priceId = subscription.items.data[0].price.id;

        const customer = await stripe.customers.retrieve(customerId as string);
        if (!customer || !('email' in customer)) {
          throw new Error('No customer email found');
        }

        const { data: users, error: userError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('email', customer.email)
          .single();

        if (userError || !users) {
          console.error('User lookup error:', userError);
          throw new Error(`No user found for email: ${customer.email}`);
        }

        const { data: plans, error: planError } = await supabase
          .from('subscription_plans')
          .select('id, name')
          .eq('stripe_price_id', priceId)
          .single();

        if (planError || !plans) {
          console.error('Plan lookup error:', planError);
          throw new Error(`No plan found for price: ${priceId}`);
        }

        const { error: updateError } = await supabase.rpc(
          'handle_subscription_update',
          {
            user_id: users.id,
            new_plan_id: plans.id,
            new_status: subscription.status,
            new_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            new_period_end: new Date(subscription.current_period_end * 1000).toISOString()
          }
        );

        if (updateError) throw updateError;

        // Send plan-changed email when the price actually changed (not on initial create or simple status flips)
        const priceChanged =
          event.type === 'customer.subscription.updated' &&
          previousAttributes?.items?.data?.[0]?.price?.id &&
          previousAttributes.items.data[0].price.id !== priceId;

        if (priceChanged) {
          const prevPriceId = previousAttributes.items.data[0].price.id as string;
          const { data: prevPlan } = await supabase
            .from('subscription_plans')
            .select('name')
            .eq('stripe_price_id', prevPriceId)
            .maybeSingle();

          await sendEmail(
            'plan-changed',
            customer.email as string,
            `plan-changed-${subscription.id}-${priceId}`,
            {
              name: users.full_name ?? undefined,
              previousPlan: prevPlan?.name ?? 'Previous plan',
              newPlan: plans.name,
              effectiveDate: new Date(subscription.current_period_start * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            },
          );
        }

        console.log(`✅ Processed ${event.type} for ${customer.email}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object;
        if (invoice.billing_reason !== 'subscription_cycle') break;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer || !('email' in customer)) break;
        const { data: u } = await supabase
          .from('profiles').select('id').eq('email', customer.email).single();
        if (!u) break;
        const { error: resetErr } = await supabase.rpc('reset_monthly_credits', { p_user_id: u.id });
        if (resetErr) console.error('reset_monthly_credits error:', resetErr);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice: any = event.data.object;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer || !('email' in customer)) break;
        const { data: u } = await supabase
          .from('profiles').select('id, full_name').eq('email', customer.email).maybeSingle();
        const amountCents = invoice.amount_due ?? invoice.amount_remaining ?? 0;
        const currency = (invoice.currency ?? 'usd').toUpperCase();
        const amountStr = `${currency} ${(amountCents / 100).toFixed(2)}`;
        const retryDate = invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : undefined;
        await sendEmail(
          'payment-failed',
          customer.email as string,
          `payment-failed-${invoice.id}-${invoice.attempt_count ?? 1}`,
          { name: u?.full_name ?? undefined, amount: amountStr, retryDate },
        );
        break;
      }

      case 'checkout.session.completed': {
        const session: any = event.data.object;
        if (session.mode !== 'payment' || session.metadata?.type !== 'credit_addon') break;
        const userId = session.metadata?.supabaseUid;
        const priceId = session.metadata?.priceId;
        if (!userId || !priceId) break;
        const { data: addonPlan, error: planErr } = await supabase
          .from('subscription_plans')
          .select('credits_allowance, name')
          .eq('stripe_price_id', priceId)
          .single();
        if (planErr || !addonPlan?.credits_allowance) break;
        const { error: addErr } = await supabase.rpc('add_credits', {
          p_user_id: userId,
          p_credits_amount: addonPlan.credits_allowance,
          p_credit_type: 'add_on',
          p_description: `Add-on minute pack: ${addonPlan.name}`,
        });
        if (addErr) console.error('add_credits error:', addErr);
        break;
      }
    }


    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});