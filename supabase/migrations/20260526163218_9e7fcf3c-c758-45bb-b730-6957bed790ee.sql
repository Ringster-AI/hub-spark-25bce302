
CREATE TABLE public.try_ringster_call_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_try_ringster_rl_ip_time ON public.try_ringster_call_rate_limits (ip_address, created_at DESC);
CREATE INDEX idx_try_ringster_rl_phone_time ON public.try_ringster_call_rate_limits (phone_number, created_at DESC);

GRANT ALL ON public.try_ringster_call_rate_limits TO service_role;

ALTER TABLE public.try_ringster_call_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.try_ringster_call_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);
