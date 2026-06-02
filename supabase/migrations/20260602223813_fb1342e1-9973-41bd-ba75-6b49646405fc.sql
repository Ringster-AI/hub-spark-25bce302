-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Unschedule any previous job with this name (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-lifecycle-cron-daily') THEN
    PERFORM cron.unschedule('email-lifecycle-cron-daily');
  END IF;
END $$;

-- Daily at 14:00 UTC (mid-morning US business hours) invoke the lifecycle email scanner
SELECT cron.schedule(
  'email-lifecycle-cron-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://owzerqaududhfwngyqbp.supabase.co/functions/v1/email-lifecycle-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93emVycWF1ZHVkaGZ3bmd5cWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0MjgzMjYsImV4cCI6MjA1MTAwNDMyNn0.FgkO0e2Ey77Og15q-pdL4r6Mlz6t9ExJZCm2eXcAhMo"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);
