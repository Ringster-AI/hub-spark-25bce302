-- Consent attestation per campaign (TCPA defense record)
CREATE TABLE IF NOT EXISTS public.campaign_consent_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attested_by_email text,
  consent_source text NOT NULL,
  consent_notes text,
  contact_count integer NOT NULL DEFAULT 0,
  attested_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cca_campaign ON public.campaign_consent_attestations(campaign_id);

GRANT SELECT, INSERT ON public.campaign_consent_attestations TO authenticated;
GRANT ALL ON public.campaign_consent_attestations TO service_role;
ALTER TABLE public.campaign_consent_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attestations"
  ON public.campaign_consent_attestations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create attestations for their campaigns"
  ON public.campaign_consent_attestations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
  );

-- Per-account Do Not Call suppression list
CREATE TABLE IF NOT EXISTS public.do_not_call_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.do_not_call_entries TO authenticated;
GRANT ALL ON public.do_not_call_entries TO service_role;
ALTER TABLE public.do_not_call_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own DNC entries"
  ON public.do_not_call_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);