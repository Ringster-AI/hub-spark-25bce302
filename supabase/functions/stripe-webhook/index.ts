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

    // Event dedupe (separate from commission ledger uniqueness)
    const { data: seen } = await supabase.from('stripe_webhook_events').select('status').eq('stripe_event_id', event.id).maybeSingle();
    if (seen?.status === 'processed') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!seen) await supabase.from('stripe_webhook_events').insert({ stripe_event_id: event.id, type: event.type });
    const markEvent = (status: 'processed' | 'failed', error?: string) =>
      supabase.from('stripe_webhook_events').update({ status, processed_at: new Date().toISOString(), error: error ?? null }).eq('stripe_event_id', event.id);

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

    // Billable account = owner user id. Resolve from Stripe metadata, stored customer id, then email.
    async function resolveAccount(customerId: string, subscriptionId?: string): Promise<string | null> {
      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const uid = (sub.metadata as any)?.supabaseUid;
          if (uid) return uid;
        } catch (_) { /* ignore */ }
      }
      const customer: any = await stripe.customers.retrieve(customerId);
      if (customer?.metadata?.supabaseUid) return customer.metadata.supabaseUid;
      const { data: bySub } = await supabase.from('user_subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
      if (bySub?.user_id) return bySub.user_id;
      if (customer?.email) {
        const { data: p } = await supabase.from('profiles').select('id').eq('email', customer.email).maybeSingle();
        if (p?.id) {
          await supabase.from('user_subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', p.id).is('stripe_customer_id', null);
          return p.id;
        }
      }
      return null;
    }

    async function claimPartnerAttribution(invoice: any) {
      const customerId = invoice.customer as string;
      const uid = await resolveAccount(customerId, invoice.subscription as string);
      if (!uid) return;
      const { data: owner } = await supabase.rpc('partner_account_owner', { p_user: uid });
      const paid = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 10 });
      const priorPaid = paid.data.some((i: any) => i.id !== invoice.id && (i.amount_paid ?? 0) > 0 && i.created < invoice.created);
      const paidAt = new Date(((invoice.status_transitions?.paid_at) ?? invoice.created) * 1000).toISOString();
      const { data, error } = await supabase.rpc('claim_partner_attribution', {
        p_account: owner ?? uid, p_stripe_customer: customerId, p_paid_at: paidAt, p_prior_paid: priorPaid,
      });
      if (error) throw error;
      console.log('partner attribution', JSON.stringify(data));
    }

    // Commission ledger: one entry per eligible subscription line (ledger key = invoice + line).
    async function recordPartnerCommissions(invoice: any) {
      const uid = await resolveAccount(invoice.customer as string, invoice.subscription as string);
      if (!uid) return;
      const { data: owner } = await supabase.rpc('partner_account_owner', { p_user: uid });
      const account = owner ?? uid;
      const { data: cfg } = await supabase.from('partner_program_config').select('excluded_price_ids').maybeSingle();
      const excludedPrices: string[] = cfg?.excluded_price_ids ?? [];
      const occurred = new Date(((invoice.status_transitions?.paid_at) ?? invoice.created) * 1000).toISOString();
      let lines = invoice.lines?.data ?? [];
      if (invoice.lines?.has_more) {
        lines = (await stripe.invoices.listLineItems(invoice.id, { limit: 100 })).data;
      }
      for (const line of lines) {
        const price = line.price;
        if (line.type !== 'subscription' && !line.proration) continue;
        if (!price?.recurring) continue; // one-time items (credit top-ups) excluded
        if (price.recurring.usage_type === 'metered') continue; // usage overages excluded
        if (excludedPrices.includes(price.id)) continue; // e.g. number rental
        const { data: plan } = await supabase.from('subscription_plans')
          .select('is_pay_as_you_go').eq('stripe_price_id', price.id).maybeSingle();
        if (!plan || plan.is_pay_as_you_go) continue; // only known recurring base plans
        const discounts = (line.discount_amounts ?? []).reduce((s: number, d: any) => s + (d.amount ?? 0), 0);
        const gross = (line.amount ?? 0) - discounts; // pre-tax
        if (gross === 0) continue;
        const { error } = await supabase.rpc('record_partner_commission_line', {
          p_account: account, p_event: event.id, p_invoice: invoice.id, p_line: line.id,
          p_gross: gross, p_excluded: 0, p_currency: invoice.currency, p_interval: price.recurring.interval, p_occurred: occurred,
        });
        if (error) throw error;
      }
    }

    async function reverseCommission(key: string, source: string, objectId: string, invoiceId: string | null, amount: number, sign: 1 | -1) {
      if (!invoiceId) return;
      const inv: any = await stripe.invoices.retrieve(invoiceId);
      const base = inv.amount_paid || inv.total;
      if (!base) return;
      const { error } = await supabase.rpc('record_partner_commission_reversal', {
        p_ledger_key: key, p_source: source, p_event: event.id, p_object: objectId, p_invoice: invoiceId,
        p_ratio: sign * Math.min(1, amount / base), p_occurred: new Date().toISOString(),
      });
      if (error) throw error;
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

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object;
        // Partner attribution: claimed on the first eligible paid subscription invoice
        if (invoice.subscription && (invoice.amount_paid ?? 0) > 0) {
          await claimPartnerAttribution(invoice);
          await recordPartnerCommissions(invoice);
        }
        if (event.type === 'invoice.paid') break;
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

      case 'credit_note.created': {
        const cn: any = event.data.object;
        await reverseCommission(`cn:${cn.id}`, 'credit_note_line', cn.id, cn.invoice, cn.subtotal_excluding_tax ?? cn.subtotal ?? cn.amount, -1);
        break;
      }

      case 'charge.refunded': {
        const charge: any = event.data.object;
        if (!charge.invoice) break;
        const notes = await stripe.creditNotes.list({ invoice: charge.invoice, limit: 100 });
        const noteRefunds = new Set(notes.data.map((n: any) => n.refund).filter(Boolean));
        for (const rf of charge.refunds?.data ?? []) {
          if (noteRefunds.has(rf.id)) continue; // already reversed via its credit note
          await reverseCommission(`rf:${rf.id}`, 'refund', rf.id, charge.invoice, rf.amount, -1);
        }
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const dispute: any = event.data.object;
        const charge: any = await stripe.charges.retrieve(dispute.charge);
        if (event.type === 'charge.dispute.created') {
          await reverseCommission(`dp:${dispute.id}`, 'dispute', dispute.id, charge.invoice, dispute.amount, -1);
        } else if (dispute.status === 'won') {
          await reverseCommission(`dpw:${dispute.id}`, 'dispute', dispute.id, charge.invoice, dispute.amount, 1);
        }
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


    await markEvent('processed');
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