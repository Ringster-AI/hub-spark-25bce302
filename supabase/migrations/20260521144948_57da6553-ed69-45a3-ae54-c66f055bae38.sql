
DROP POLICY IF EXISTS "Users can view their own cookie consent" ON public.cookie_consent_logs;

CREATE POLICY "Authenticated users can view their own cookie consent"
ON public.cookie_consent_logs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Block anon reads on cookie_consent_logs"
ON public.cookie_consent_logs
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);
