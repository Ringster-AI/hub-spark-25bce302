CREATE POLICY "Block authenticated insert on call_events" ON public.call_events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Block authenticated update on call_events" ON public.call_events AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block authenticated delete on call_events" ON public.call_events AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "Block anon all on call_events" ON public.call_events AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);