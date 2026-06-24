
-- Make agent + campaign deletes cascade cleanly for super-admin agent deletion

ALTER TABLE public.campaigns DROP CONSTRAINT campaigns_agent_id_fkey;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agent_configs(id) ON DELETE CASCADE;

ALTER TABLE public.tool_call_logs DROP CONSTRAINT fk_agent;
ALTER TABLE public.tool_call_logs ADD CONSTRAINT fk_agent
  FOREIGN KEY (agent_id) REFERENCES public.agent_configs(id) ON DELETE CASCADE;

ALTER TABLE public.booking_requests DROP CONSTRAINT booking_requests_campaign_id_fkey;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_bookings DROP CONSTRAINT calendar_bookings_campaign_id_fkey;
ALTER TABLE public.calendar_bookings ADD CONSTRAINT calendar_bookings_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_contacts DROP CONSTRAINT campaign_contacts_campaign_id_fkey;
ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.follow_up_sequences DROP CONSTRAINT follow_up_sequences_campaign_id_fkey;
ALTER TABLE public.follow_up_sequences ADD CONSTRAINT follow_up_sequences_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
