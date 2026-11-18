DROP POLICY IF EXISTS "Allow anonymous cookie consent insert" ON public.cookie_consent_logs;
CREATE POLICY "Allow anonymous cookie consent insert" ON public.cookie_consent_logs FOR INSERT TO anon, authenticated
WITH CHECK ((user_id IS NULL OR user_id = auth.uid()) AND length(session_id) BETWEEN 1 AND 200 AND essential = true
  AND (ip_address IS NULL OR length(ip_address) <= 100) AND (user_agent IS NULL OR length(user_agent) <= 1000));

DROP POLICY IF EXISTS "Allow anonymous insert to waitlist" ON public.waitlist;
CREATE POLICY "Allow anonymous insert to waitlist" ON public.waitlist FOR INSERT TO anon, authenticated
WITH CHECK (length(email) <= 255 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

DROP POLICY IF EXISTS "Authenticated users can view plan features" ON public.plan_features;
CREATE POLICY "Authenticated users can view plan features" ON public.plan_features FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.subscription_plans sp WHERE sp.id = plan_features.plan_id));

DROP POLICY IF EXISTS "Allow anonymous TCPA consent insert" ON public.tcpa_consent_logs;
CREATE POLICY "Allow anonymous TCPA consent insert" ON public.tcpa_consent_logs FOR INSERT TO anon, authenticated
WITH CHECK (consent_given = true AND length(phone_number) BETWEEN 7 AND 20 AND length(name) BETWEEN 1 AND 200
  AND length(consent_text) BETWEEN 1 AND 5000 AND (company IS NULL OR length(company) <= 200)
  AND (ip_address IS NULL OR length(ip_address) <= 100) AND (user_agent IS NULL OR length(user_agent) <= 1000));

DROP POLICY IF EXISTS "Allow anonymous insert to demo_requests" ON public.demo_requests;
CREATE POLICY "Allow anonymous insert to demo_requests" ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (length(full_name) BETWEEN 1 AND 200 AND length(email) <= 255 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(phone) BETWEEN 7 AND 30 AND length(company_name) BETWEEN 1 AND 200
  AND (team_size IS NULL OR length(team_size) <= 50) AND (message IS NULL OR length(message) <= 5000)
  AND coalesce(forwarded, false) = false);

DROP POLICY IF EXISTS "Allow anonymous insert to ebook_subscribers" ON public.ebook_subscribers;
CREATE POLICY "Allow anonymous insert to ebook_subscribers" ON public.ebook_subscribers FOR INSERT TO anon, authenticated
WITH CHECK (length(email) <= 255 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

DROP POLICY IF EXISTS "Allow anonymous contact form submissions" ON public.contact_submissions;
CREATE POLICY "Allow anonymous contact form submissions" ON public.contact_submissions FOR INSERT TO anon, authenticated
WITH CHECK (length(name) BETWEEN 1 AND 200 AND length(email) <= 255 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (phone IS NULL OR length(phone) <= 30) AND length(message) BETWEEN 1 AND 5000);