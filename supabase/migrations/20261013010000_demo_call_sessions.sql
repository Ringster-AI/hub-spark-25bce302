-- Additive foundation only. No existing call or credit tables are changed.
CREATE TABLE public.demo_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN
    ('reserved', 'uncertain', 'ready', 'connected', 'completed', 'failed_preconnect')),
  provider_call_id text UNIQUE,
  max_duration_seconds integer NOT NULL DEFAULT 120 CHECK (max_duration_seconds = 120),
  connected_at timestamptz,
  finished_at timestamptz,
  duration_seconds numeric CHECK (duration_seconds >= 0),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

CREATE INDEX demo_call_sessions_user_created_idx
  ON public.demo_call_sessions (user_id, created_at);

-- Defence in depth in addition to the account lock in reserve_demo_call.
CREATE UNIQUE INDEX demo_call_sessions_one_pending_idx
  ON public.demo_call_sessions (user_id)
  WHERE state IN ('reserved', 'uncertain', 'ready', 'connected');

ALTER TABLE public.demo_call_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_call_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.demo_call_sessions TO authenticated;
GRANT ALL ON public.demo_call_sessions TO service_role;
CREATE POLICY demo_call_sessions_read_own ON public.demo_call_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Only the authenticated application server may reserve capacity. The server
-- must pass the user ID obtained from auth.getUser(), never from request JSON.
CREATE FUNCTION public.reserve_demo_call(p_user_id uuid, p_request_id uuid)
RETURNS public.demo_call_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_verified timestamptz;
  v_session public.demo_call_sessions;
  v_used integer;
  v_recent integer;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'demo_request_id_required';
  END IF;
  -- A durable account lock serializes requests across server instances/tabs.
  SELECT email_confirmed_at INTO v_verified FROM auth.users
    WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_verified IS NULL THEN
    RAISE EXCEPTION 'demo_verified_account_required';
  END IF;

  SELECT * INTO v_session FROM public.demo_call_sessions
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN RETURN v_session; END IF;

  IF EXISTS (SELECT 1 FROM public.demo_call_sessions WHERE user_id = p_user_id
    AND state IN ('reserved', 'uncertain', 'ready', 'connected')) THEN
    RAISE EXCEPTION 'demo_session_pending';
  END IF;

  SELECT count(*) INTO v_used FROM public.demo_call_sessions
    WHERE user_id = p_user_id AND state <> 'failed_preconnect';
  IF v_used >= 3 THEN RAISE EXCEPTION 'demo_allowance_exhausted'; END IF;

  -- Confirmed connection failures do not spend an allowance slot, but repeated
  -- setup attempts still have a separate abuse/operational limit.
  SELECT count(*) INTO v_recent FROM public.demo_call_sessions
    WHERE user_id = p_user_id AND created_at > now() - interval '24 hours';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'demo_retry_limit'; END IF;

  INSERT INTO public.demo_call_sessions (user_id, request_id)
    VALUES (p_user_id, p_request_id) RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

-- Server/provider evidence only. A browser disconnect is NOT evidence that no
-- conversation happened. Timeouts remain uncertain until reconciled.
CREATE FUNCTION public.record_demo_call_state(
  p_session_id uuid,
  p_state text,
  p_provider_call_id text DEFAULT NULL,
  p_duration_seconds numeric DEFAULT NULL,
  p_failure_code text DEFAULT NULL
) RETURNS public.demo_call_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session public.demo_call_sessions;
BEGIN
  SELECT * INTO v_session FROM public.demo_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'demo_session_not_found'; END IF;
  IF p_state IS NULL OR p_state NOT IN
    ('uncertain', 'ready', 'connected', 'completed', 'failed_preconnect') THEN
    RAISE EXCEPTION 'demo_invalid_state';
  END IF;
  IF p_provider_call_id IS NOT NULL AND length(trim(p_provider_call_id)) = 0 THEN
    RAISE EXCEPTION 'demo_provider_call_required';
  END IF;
  IF v_session.provider_call_id IS NOT NULL AND p_provider_call_id IS NOT NULL
    AND v_session.provider_call_id <> p_provider_call_id THEN
    RAISE EXCEPTION 'demo_provider_call_mismatch';
  END IF;
  IF p_duration_seconds < 0 THEN RAISE EXCEPTION 'demo_invalid_duration'; END IF;

  -- Duplicate reports and delayed live events must not reopen a finished call.
  IF v_session.state IN ('completed', 'failed_preconnect') THEN
    IF p_state IN ('completed', 'failed_preconnect') AND p_state <> v_session.state THEN
      RAISE EXCEPTION 'demo_conflicting_terminal_evidence';
    END IF;
    RETURN v_session;
  END IF;
  IF p_state IN ('ready', 'connected', 'completed')
    AND COALESCE(v_session.provider_call_id, p_provider_call_id) IS NULL THEN
    RAISE EXCEPTION 'demo_provider_call_required';
  END IF;
  IF p_state = 'failed_preconnect' THEN
    IF v_session.connected_at IS NOT NULL OR COALESCE(p_duration_seconds, 0) > 0 THEN
      RAISE EXCEPTION 'demo_connected_attempt_not_refundable';
    END IF;
    IF p_failure_code IS NULL OR length(trim(p_failure_code)) = 0 THEN
      RAISE EXCEPTION 'demo_failure_evidence_required';
    END IF;
  END IF;
  -- Ignore late setup messages once the conversation has started.
  IF v_session.state = 'connected' AND p_state IN ('uncertain', 'ready') THEN
    RETURN v_session;
  END IF;
  IF v_session.state = 'ready' AND p_state = 'uncertain' THEN RETURN v_session; END IF;

  UPDATE public.demo_call_sessions SET
    state = p_state,
    provider_call_id = COALESCE(provider_call_id, p_provider_call_id),
    connected_at = CASE WHEN p_state = 'connected'
      THEN COALESCE(connected_at, now()) ELSE connected_at END,
    finished_at = CASE WHEN p_state IN ('completed', 'failed_preconnect')
      THEN now() ELSE finished_at END,
    duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
    failure_code = COALESCE(p_failure_code, failure_code),
    updated_at = now()
    WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_call(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_call(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_demo_call_state(uuid, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_demo_call_state(uuid, text, text, numeric, text) TO service_role;

-- Commit this claim BEFORE making the external request. If the worker dies,
-- the session is uncertain and must be reconciled, never blindly dispatched.
CREATE FUNCTION public.claim_demo_call_dispatch(p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.demo_call_sessions SET state = 'uncertain', updated_at = now()
    WHERE id = p_session_id AND state = 'reserved';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_demo_call_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_call_dispatch(uuid) TO service_role;
