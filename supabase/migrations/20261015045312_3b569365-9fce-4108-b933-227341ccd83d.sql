DROP POLICY IF EXISTS "Admins can read email send log" ON public.email_send_log;
REVOKE SELECT ON public.email_send_log FROM authenticated;
REVOKE ALL ON public.email_send_log FROM anon;