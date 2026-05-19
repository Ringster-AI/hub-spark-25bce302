-- call_logs: block all writes from anon/authenticated
CREATE POLICY "Block user inserts on call_logs" ON public.call_logs
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block user updates on call_logs" ON public.call_logs
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block user deletes on call_logs" ON public.call_logs
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- call_recordings: block all writes from anon/authenticated
CREATE POLICY "Block user inserts on call_recordings" ON public.call_recordings
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block user updates on call_recordings" ON public.call_recordings
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block user deletes on call_recordings" ON public.call_recordings
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- phone_verifications: explicitly deny all access from anon/authenticated
CREATE POLICY "Block anon and authenticated access on phone_verifications" ON public.phone_verifications
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
