ALTER TABLE public.demo_call_sessions ADD COLUMN business_snapshot jsonb;

CREATE FUNCTION public.reserve_demo_call_with_business(p_user_id uuid, p_request_id uuid, p_business jsonb)
RETURNS public.demo_call_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_session public.demo_call_sessions;
BEGIN
  IF p_business IS NULL OR jsonb_typeof(p_business) <> 'object' THEN
    RAISE EXCEPTION 'demo_business_required';
  END IF;
  v_session := public.reserve_demo_call(p_user_id, p_request_id);
  IF v_session.business_snapshot IS NOT NULL AND v_session.business_snapshot <> p_business THEN
    RAISE EXCEPTION 'demo_request_configuration_mismatch';
  END IF;
  IF v_session.business_snapshot IS NULL THEN
    IF v_session.state <> 'reserved' THEN RAISE EXCEPTION 'demo_snapshot_missing'; END IF;
    UPDATE public.demo_call_sessions SET business_snapshot = p_business
      WHERE id = v_session.id RETURNING * INTO v_session;
  END IF;
  RETURN v_session;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_demo_call_with_business(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_call_with_business(uuid, uuid, jsonb) TO service_role;

-- Webhook inbox contains only identifiers, not full Vapi payloads (which may
-- include credentials or room URLs). The worker retrieves authoritative data.
CREATE TABLE public.demo_call_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  provider_call_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.demo_call_sessions(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text
);
ALTER TABLE public.demo_call_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_call_inbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.demo_call_inbox TO service_role;

CREATE TABLE public.demo_call_results (
  session_id uuid PRIMARY KEY REFERENCES public.demo_call_sessions(id) ON DELETE CASCADE,
  transcript text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.demo_call_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_call_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.demo_call_results TO authenticated;
GRANT ALL ON public.demo_call_results TO service_role;
CREATE POLICY demo_call_results_read_own ON public.demo_call_results
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.demo_call_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

-- State, transcript and inbox acknowledgement commit together. A worker crash
-- cannot acknowledge a final result which was never saved.
CREATE FUNCTION public.apply_demo_call_evidence(
  p_event_id uuid, p_state text, p_duration numeric, p_failure text, p_transcript text
) RETURNS public.demo_call_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event public.demo_call_inbox; v_session public.demo_call_sessions;
BEGIN
  SELECT * INTO v_event FROM public.demo_call_inbox WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'demo_event_not_found'; END IF;
  IF v_event.processed_at IS NOT NULL THEN
    SELECT * INTO v_session FROM public.demo_call_sessions WHERE id = v_event.session_id;
    RETURN v_session;
  END IF;
  v_session := public.record_demo_call_state(v_event.session_id, p_state,
    v_event.provider_call_id, p_duration, p_failure);
  IF p_state = 'completed' AND p_transcript IS NOT NULL THEN
    IF length(p_transcript) > 100000 THEN RAISE EXCEPTION 'demo_transcript_too_large'; END IF;
    INSERT INTO public.demo_call_results (session_id, transcript)
      VALUES (v_event.session_id, p_transcript)
      ON CONFLICT (session_id) DO UPDATE SET
        transcript = EXCLUDED.transcript, updated_at = now();
  END IF;
  UPDATE public.demo_call_inbox SET processed_at = now(), last_error = NULL WHERE id = p_event_id;
  RETURN v_session;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_demo_call_evidence(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_demo_call_evidence(uuid, text, numeric, text, text) TO service_role;
