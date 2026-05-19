
-- TCPA: explicit restrictive SELECT — only admin or service_role can read
DROP POLICY IF EXISTS "Block anon and authenticated reads on tcpa_consent_logs" ON public.tcpa_consent_logs;
CREATE POLICY "Block anon and authenticated reads on tcpa_consent_logs"
ON public.tcpa_consent_logs
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (has_role(auth.uid(), 'admin'::text));

-- Credit transactions: explicitly deny writes from authenticated/anon users
DROP POLICY IF EXISTS "Block user inserts on credit_transactions" ON public.credit_transactions;
CREATE POLICY "Block user inserts on credit_transactions"
ON public.credit_transactions
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Block user updates on credit_transactions" ON public.credit_transactions;
CREATE POLICY "Block user updates on credit_transactions"
ON public.credit_transactions
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Block user deletes on credit_transactions" ON public.credit_transactions;
CREATE POLICY "Block user deletes on credit_transactions"
ON public.credit_transactions
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
