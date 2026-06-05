CREATE OR REPLACE FUNCTION public.finalize_call(
  p_user_id uuid,
  p_agent_id uuid,
  p_vapi_call_id text,
  p_duration_seconds integer,
  p_from_number text DEFAULT NULL,
  p_to_number text DEFAULT NULL,
  p_recording_url text DEFAULT NULL,
  p_transcript_url text DEFAULT NULL,
  p_started_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_log_id uuid;
  v_minutes integer;
  v_owner uuid;
  v_agent_type text;
  v_call_label text;
BEGIN
  -- Verify the agent actually belongs to the claimed user (defense in depth)
  SELECT user_id, agent_type INTO v_owner, v_agent_type
  FROM public.agent_configs
  WHERE id = p_agent_id;

  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'agent does not belong to user';
  END IF;

  v_call_label := CASE v_agent_type
    WHEN 'outbound' THEN 'Outbound call'
    ELSE 'Inbound call'
  END;

  v_minutes := GREATEST(1, CEIL(COALESCE(p_duration_seconds, 0)::numeric / 60))::integer;

  -- Upsert the call log (idempotent on vapi call id)
  INSERT INTO public.call_logs (call_sid, agent_id, from_number, to_number, duration, status, start_time, end_time)
  VALUES (p_vapi_call_id, p_agent_id, p_from_number, p_to_number, p_duration_seconds, 'completed', p_started_at, COALESCE(p_ended_at, now()))
  ON CONFLICT (call_sid) DO UPDATE
    SET duration = EXCLUDED.duration,
        status = 'completed',
        end_time = EXCLUDED.end_time,
        from_number = COALESCE(EXCLUDED.from_number, public.call_logs.from_number),
        to_number = COALESCE(EXCLUDED.to_number, public.call_logs.to_number)
  RETURNING id INTO v_call_log_id;

  -- Save recording / transcript references if provided (idempotent)
  IF p_recording_url IS NOT NULL OR p_transcript_url IS NOT NULL THEN
    INSERT INTO public.call_recordings (call_log_id, recording_url, transcript_url)
    VALUES (v_call_log_id, p_recording_url, p_transcript_url)
    ON CONFLICT (call_log_id) DO UPDATE
      SET recording_url = COALESCE(EXCLUDED.recording_url, public.call_recordings.recording_url),
          transcript_url = COALESCE(EXCLUDED.transcript_url, public.call_recordings.transcript_url);
  END IF;

  -- Only deduct credits the first time we see this call (no transaction yet for this call_log)
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE call_log_id = v_call_log_id AND transaction_type = 'deduction'
  ) THEN
    PERFORM public.deduct_credits(
      p_user_id,
      v_minutes,
      v_call_label || ' ' || p_vapi_call_id,
      v_call_log_id
    );
  END IF;

  RETURN v_call_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_call(uuid, uuid, text, integer, text, text, text, text, timestamptz, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_call(uuid, uuid, text, integer, text, text, text, text, timestamptz, timestamptz) TO service_role;