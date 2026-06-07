
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON public.credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_call_log_id ON public.credit_transactions (call_log_id) WHERE call_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created ON public.campaigns (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_agent_id ON public.campaigns (agent_id);
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_created_at ON public.calendar_bookings (created_at DESC);
