import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { SupabaseDemoStore } from './store';
import { VapiDemoProvider } from './provider';

export function demoRuntime() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPI_API_KEY, RINGSTER_DEMO_WEBHOOK_SECRET, RINGSTER_DEMO_WEBHOOK_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPI_API_KEY || !RINGSTER_DEMO_WEBHOOK_SECRET || !RINGSTER_DEMO_WEBHOOK_URL) {
    throw new Error('Demo configuration incomplete');
  }
  const webhook = new URL(RINGSTER_DEMO_WEBHOOK_URL);
  if (webhook.protocol !== 'https:' || webhook.pathname !== '/.netlify/functions/demo-webhook') {
    throw new Error('A dedicated HTTPS demo webhook is required');
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    store: new SupabaseDemoStore(db), provider: new VapiDemoProvider(VAPI_API_KEY),
    webhookUrl: webhook.href, webhookSecret: RINGSTER_DEMO_WEBHOOK_SECRET,
    authenticate: async (token: string) => {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, verified: Boolean(data.user.email_confirmed_at) };
    },
  };
}
