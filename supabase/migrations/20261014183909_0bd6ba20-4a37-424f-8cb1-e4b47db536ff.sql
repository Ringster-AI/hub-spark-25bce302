-- ===== Partner program foundation =====
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Roles: add 'partner' to app_role (not referenced in this migration)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';

-- Helpers
CREATE OR REPLACE FUNCTION public.is_partner_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.is_super_admin(_uid), false) OR COALESCE(public.has_role(_uid, 'admin'), false)
$$;

-- partners
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  invite_email text NOT NULL,
  display_name text,
  referral_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
  invited_by uuid,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.partners WHERE user_id = auth.uid() AND status = 'active'
$$;

CREATE POLICY "partner reads self" ON public.partners FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_partner_admin(auth.uid()));
CREATE POLICY "admin inserts partners" ON public.partners FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(auth.uid()));
CREATE POLICY "admin updates partners" ON public.partners FOR UPDATE TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));

-- rate versions (append-only)
CREATE TABLE public.partner_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  commission_type text NOT NULL CHECK (commission_type IN ('assisted','closed','custom')),
  rate numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  months integer NOT NULL DEFAULT 12 CHECK (months > 0),
  holding_monthly_days integer NOT NULL DEFAULT 30,
  holding_annual_days integer NOT NULL DEFAULT 45,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.partner_rate_versions TO authenticated;
GRANT ALL ON public.partner_rate_versions TO service_role;
ALTER TABLE public.partner_rate_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates readable by owner/admin" ON public.partner_rate_versions FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));
CREATE POLICY "admin adds rates" ON public.partner_rate_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(auth.uid()));

-- agreements
CREATE TABLE public.partner_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partner_agreements TO authenticated;
GRANT ALL ON public.partner_agreements TO service_role;
ALTER TABLE public.partner_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agreements readable" ON public.partner_agreements FOR SELECT TO authenticated
  USING (published_at IS NOT NULL OR public.is_partner_admin(auth.uid()));
CREATE POLICY "admin manages agreements" ON public.partner_agreements FOR INSERT TO authenticated
  WITH CHECK (public.is_partner_admin(auth.uid()));
CREATE POLICY "admin edits unpublished agreements" ON public.partner_agreements FOR UPDATE TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));

CREATE TABLE public.partner_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL REFERENCES public.partner_agreements(id),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  UNIQUE (partner_id, agreement_id)
);
GRANT SELECT ON public.partner_agreement_acceptances TO authenticated;
GRANT ALL ON public.partner_agreement_acceptances TO service_role;
ALTER TABLE public.partner_agreement_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acceptances readable" ON public.partner_agreement_acceptances FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()) OR public.is_partner_admin(auth.uid()));

-- program config (single row)
CREATE TABLE public.partner_program_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_assisted_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  default_closed_rate numeric(5,4) NOT NULL DEFAULT 0.20,
  default_months integer NOT NULL DEFAULT 12,
  holding_monthly_days integer NOT NULL DEFAULT 30,
  holding_annual_days integer NOT NULL DEFAULT 45,
  min_payout_cents integer NOT NULL DEFAULT 5000,
  payout_day integer NOT NULL DEFAULT 15,
  protection_days integer NOT NULL DEFAULT 90,
  activity_deadline_days integer NOT NULL DEFAULT 14,
  link_touch_days integer NOT NULL DEFAULT 90,
  excluded_price_ids text[] NOT NULL DEFAULT '{}',
  excluded_line_kinds text[] NOT NULL DEFAULT ARRAY['tax','number_rental','usage_overage','credit_topup'],
  volume_flag jsonb NOT NULL DEFAULT '{"registered_14d":50,"active_claims":150,"min_contacted_ratio":0.2,"stale_ratio":0.4}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.partner_program_config TO authenticated;
GRANT ALL ON public.partner_program_config TO service_role;
ALTER TABLE public.partner_program_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config readable by partners/admin" ON public.partner_program_config FOR SELECT TO authenticated
  USING (public.current_partner_id() IS NOT NULL OR public.is_partner_admin(auth.uid()));
CREATE POLICY "admin updates config" ON public.partner_program_config FOR UPDATE TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));
INSERT INTO public.partner_program_config (id) VALUES (true);

-- prospects
CREATE TABLE public.partner_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  business_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  website text,
  industry text,
  industry_other text,
  lead_source text,
  location_label text,
  street text,
  city text,
  postal_code text,
  purchasing_entity text NOT NULL DEFAULT 'unknown' CHECK (purchasing_entity IN ('independent','parent_controlled','unknown')),
  norm_email text,
  norm_phone text,
  norm_business text,
  norm_domain text,
  match_key_business text,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','contacted','qualified','demo_booked','demo_completed','signed_up','paying','lost')),
  protection_status text NOT NULL DEFAULT 'protected' CHECK (protection_status IN ('protected','review_needed','released','disputed')),
  protected_until timestamptz NOT NULL DEFAULT now() + interval '90 days',
  activity_deadline timestamptz NOT NULL DEFAULT now() + interval '14 days',
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  converted_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.partner_prospects (partner_id);
CREATE INDEX ON public.partner_prospects (norm_email);
CREATE INDEX ON public.partner_prospects (norm_phone);
CREATE INDEX ON public.partner_prospects (match_key_business);
GRANT SELECT, UPDATE ON public.partner_prospects TO authenticated;
GRANT ALL ON public.partner_prospects TO service_role;
ALTER TABLE public.partner_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prospects readable" ON public.partner_prospects FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));
CREATE POLICY "own prospects editable" ON public.partner_prospects FOR UPDATE TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()))
  WITH CHECK (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));

-- Guard: partners cannot set system statuses, change ownership or protection
CREATE OR REPLACE FUNCTION public.guard_prospect_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR auth.uid() IS NULL
     OR public.is_partner_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.partner_id <> OLD.partner_id OR NEW.protection_status <> OLD.protection_status
     OR NEW.protected_until <> OLD.protected_until OR NEW.activity_deadline <> OLD.activity_deadline
     OR NEW.converted_account_id IS DISTINCT FROM OLD.converted_account_id
     OR NEW.norm_email IS DISTINCT FROM OLD.norm_email OR NEW.norm_phone IS DISTINCT FROM OLD.norm_phone
     OR NEW.match_key_business IS DISTINCT FROM OLD.match_key_business
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.business_name <> OLD.business_name THEN
    RAISE EXCEPTION 'Not allowed to change protected prospect fields';
  END IF;
  IF NEW.status <> OLD.status AND NEW.status NOT IN ('registered','contacted','qualified','lost','demo_completed') THEN
    RAISE EXCEPTION 'Status % is set by the system', NEW.status;
  END IF;
  IF NEW.status <> OLD.status AND OLD.status IN ('signed_up','paying') THEN
    RAISE EXCEPTION 'Converted prospects cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_prospect_update BEFORE UPDATE ON public.partner_prospects
  FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_update();

-- activities (append-only)
CREATE TABLE public.partner_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  type text NOT NULL CHECK (type IN ('call','email','sms','meeting','note','demo','system')),
  summary text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  next_action text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.partner_activities (prospect_id);
GRANT SELECT, INSERT ON public.partner_activities TO authenticated;
GRANT ALL ON public.partner_activities TO service_role;
ALTER TABLE public.partner_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities readable" ON public.partner_activities FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));
CREATE POLICY "own activities insert" ON public.partner_activities FOR INSERT TO authenticated
  WITH CHECK (partner_id = public.current_partner_id() AND type <> 'system'
    AND EXISTS (SELECT 1 FROM public.partner_prospects p WHERE p.id = prospect_id AND p.partner_id = public.current_partner_id()));

-- outreach activity extends protection deadline
CREATE OR REPLACE FUNCTION public.on_partner_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d integer;
BEGIN
  IF NEW.type IN ('call','email','sms','meeting','demo') THEN
    SELECT activity_deadline_days INTO d FROM public.partner_program_config LIMIT 1;
    UPDATE public.partner_prospects
       SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.occurred_at), NEW.occurred_at),
           activity_deadline = LEAST(protected_until, GREATEST(activity_deadline, NEW.occurred_at + make_interval(days => COALESCE(d,14)))),
           protection_status = CASE WHEN protection_status = 'review_needed' THEN 'protected' ELSE protection_status END,
           status = CASE WHEN status = 'registered' THEN 'contacted' ELSE status END,
           updated_at = now()
     WHERE id = NEW.prospect_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_on_partner_activity AFTER INSERT ON public.partner_activities
  FOR EACH ROW EXECUTE FUNCTION public.on_partner_activity();

-- demo settings + demos
CREATE TABLE public.partner_demo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  google_integration_id uuid REFERENCES public.google_integrations(id) ON DELETE SET NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  duration_min integer NOT NULL DEFAULT 30,
  buffer_min integer NOT NULL DEFAULT 15,
  min_notice_hours integer NOT NULL DEFAULT 12,
  window_days integer NOT NULL DEFAULT 14,
  working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  working_start text NOT NULL DEFAULT '09:00',
  working_end text NOT NULL DEFAULT '17:00',
  timezone text NOT NULL DEFAULT 'America/Toronto',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.partner_demo_settings TO authenticated;
GRANT ALL ON public.partner_demo_settings TO service_role;
ALTER TABLE public.partner_demo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads demo settings" ON public.partner_demo_settings FOR SELECT TO authenticated
  USING (public.is_partner_admin(auth.uid()));
CREATE POLICY "admin updates demo settings" ON public.partner_demo_settings FOR UPDATE TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));
INSERT INTO public.partner_demo_settings (id) VALUES (true);

CREATE TABLE public.partner_demos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  calendar_id text NOT NULL,
  google_event_id text,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  slot tstzrange GENERATED ALWAYS AS (tstzrange(slot_start, slot_end, '[)')) STORED,
  timezone text,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','booked','completed','no_show','cancelled','rescheduled')),
  hold_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slot_end > slot_start),
  EXCLUDE USING gist (calendar_id WITH =, slot WITH &&) WHERE (status IN ('held','booked'))
);
GRANT SELECT ON public.partner_demos TO authenticated;
GRANT ALL ON public.partner_demos TO service_role;
ALTER TABLE public.partner_demos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own demos readable" ON public.partner_demos FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));

-- referral touches (evidence)
CREATE TABLE public.referral_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  user_id uuid,
  code text NOT NULL,
  source text NOT NULL CHECK (source IN ('link','code','checkout')),
  landing_url text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.referral_touches (user_id);
GRANT SELECT ON public.referral_touches TO authenticated;
GRANT ALL ON public.referral_touches TO service_role;
ALTER TABLE public.referral_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads touches" ON public.referral_touches FOR SELECT TO authenticated
  USING (public.is_partner_admin(auth.uid()));

-- attributions (billable account = owner user id)
CREATE TABLE public.partner_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  prospect_id uuid REFERENCES public.partner_prospects(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('manual','prospect_match','code','link')),
  conversion_kind text NOT NULL DEFAULT 'new_signup' CHECK (conversion_kind IN ('new_signup','existing_free_account')),
  commission_type text NOT NULL DEFAULT 'assisted' CHECK (commission_type IN ('assisted','closed','custom')),
  rate_version_id uuid REFERENCES public.partner_rate_versions(id),
  rate_snapshot numeric(5,4) NOT NULL,
  months_snapshot integer NOT NULL,
  holding_monthly_days integer NOT NULL,
  holding_annual_days integer NOT NULL,
  agreement_version text,
  eligibility_starts_at timestamptz,
  eligibility_ends_at timestamptz,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','active','ended','revoked','rejected')),
  match_evidence jsonb NOT NULL DEFAULT '{}',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.partner_attributions (account_id);
GRANT SELECT ON public.partner_attributions TO authenticated;
GRANT ALL ON public.partner_attributions TO service_role;
ALTER TABLE public.partner_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attributions readable" ON public.partner_attributions FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));

-- webhook event dedupe
CREATE TABLE public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed')),
  error text
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- payouts
CREATE TABLE public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  period text NOT NULL,
  scheduled_for date NOT NULL,
  total_cents integer NOT NULL DEFAULT 0,
  carried_forward_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','carried_forward')),
  method text,
  reference text,
  approved_by uuid,
  paid_at timestamptz,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, period)
);
GRANT SELECT ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payouts readable" ON public.partner_payouts FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));

-- commission ledger
CREATE TABLE public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_key text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  attribution_id uuid NOT NULL REFERENCES public.partner_attributions(id),
  account_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('invoice_line','credit_note_line','refund','dispute','rate_adjustment','manual')),
  stripe_event_id text,
  stripe_object_id text,
  invoice_id text,
  invoice_line_id text,
  gross_line_cents integer NOT NULL DEFAULT 0,
  excluded_cents integer NOT NULL DEFAULT 0,
  eligible_cents integer NOT NULL,
  rate_version_id uuid REFERENCES public.partner_rate_versions(id),
  rate numeric(5,4) NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  billing_interval text,
  occurred_at timestamptz NOT NULL,
  earn_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','earned','approved','paid','reversed','held')),
  payout_id uuid REFERENCES public.partner_payouts(id),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.partner_commissions (partner_id, status);
CREATE INDEX ON public.partner_commissions (attribution_id);
GRANT SELECT ON public.partner_commissions TO authenticated;
GRANT ALL ON public.partner_commissions TO service_role;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own commissions readable" ON public.partner_commissions FOR SELECT TO authenticated
  USING (partner_id = public.current_partner_id() OR public.is_partner_admin(auth.uid()));

-- immutability of financial facts
CREATE OR REPLACE FUNCTION public.guard_commission_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Commission entries cannot be deleted; add a reversal'; END IF;
  IF NEW.ledger_key <> OLD.ledger_key OR NEW.amount_cents <> OLD.amount_cents OR NEW.eligible_cents <> OLD.eligible_cents
     OR NEW.rate <> OLD.rate OR NEW.partner_id <> OLD.partner_id OR NEW.attribution_id <> OLD.attribution_id
     OR NEW.occurred_at <> OLD.occurred_at OR NEW.source_type <> OLD.source_type THEN
    RAISE EXCEPTION 'Financial fields are immutable; add an adjustment entry';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_commission BEFORE UPDATE OR DELETE ON public.partner_commissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_immutable();

CREATE OR REPLACE FUNCTION public.guard_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER trg_rate_versions_append_only BEFORE UPDATE OR DELETE ON public.partner_rate_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only();
CREATE TRIGGER trg_activities_append_only BEFORE UPDATE OR DELETE ON public.partner_activities
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only();
CREATE TRIGGER trg_acceptances_append_only BEFORE UPDATE OR DELETE ON public.partner_agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only();

-- review flags
CREATE TABLE public.partner_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  kind text NOT NULL CHECK (kind IN ('high_volume_low_progress','stale_claims','self_referral_suspect','dispute')),
  subject_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by uuid,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.partner_review_flags TO authenticated;
GRANT ALL ON public.partner_review_flags TO service_role;
ALTER TABLE public.partner_review_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads flags" ON public.partner_review_flags FOR SELECT TO authenticated
  USING (public.is_partner_admin(auth.uid()));
CREATE POLICY "admin resolves flags" ON public.partner_review_flags FOR UPDATE TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));

-- materials
CREATE TABLE public.partner_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deck','one_pager','video','pricing','script','other')),
  url text,
  file_path text,
  description text,
  sort integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_materials TO authenticated;
GRANT ALL ON public.partner_materials TO service_role;
ALTER TABLE public.partner_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read materials" ON public.partner_materials FOR SELECT TO authenticated
  USING ((is_published AND public.current_partner_id() IS NOT NULL) OR public.is_partner_admin(auth.uid()));
CREATE POLICY "admin manages materials" ON public.partner_materials FOR ALL TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));

-- audit log
CREATE TABLE public.partner_audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_audit_log TO authenticated;
GRANT ALL ON public.partner_audit_log TO service_role;
ALTER TABLE public.partner_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads audit" ON public.partner_audit_log FOR SELECT TO authenticated
  USING (public.is_partner_admin(auth.uid()));
CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON public.partner_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only();

CREATE OR REPLACE FUNCTION public.partner_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  r := current_setting('partner.audit_reason', true);
  INSERT INTO public.partner_audit_log(actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END, NULLIF(r,''));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_audit_partners AFTER INSERT OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.partner_audit();
CREATE TRIGGER trg_audit_rates AFTER INSERT ON public.partner_rate_versions FOR EACH ROW EXECUTE FUNCTION public.partner_audit();
CREATE TRIGGER trg_audit_attr AFTER INSERT OR UPDATE ON public.partner_attributions FOR EACH ROW EXECUTE FUNCTION public.partner_audit();
CREATE TRIGGER trg_audit_payouts AFTER INSERT OR UPDATE ON public.partner_payouts FOR EACH ROW EXECUTE FUNCTION public.partner_audit();
CREATE TRIGGER trg_audit_commissions AFTER INSERT OR UPDATE ON public.partner_commissions FOR EACH ROW EXECUTE FUNCTION public.partner_audit();
CREATE OR REPLACE FUNCTION public.partner_audit_prospect_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.partner_id <> OLD.partner_id OR NEW.protection_status <> OLD.protection_status OR NEW.protected_until <> OLD.protected_until THEN
    INSERT INTO public.partner_audit_log(actor_id, entity, entity_id, action, before, after, reason)
    VALUES (auth.uid(), 'partner_prospects', NEW.id, 'OWNERSHIP',
      jsonb_build_object('partner_id',OLD.partner_id,'protection_status',OLD.protection_status,'protected_until',OLD.protected_until),
      jsonb_build_object('partner_id',NEW.partner_id,'protection_status',NEW.protection_status,'protected_until',NEW.protected_until),
      NULLIF(current_setting('partner.audit_reason', true),''));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_prospect_owner AFTER UPDATE ON public.partner_prospects FOR EACH ROW EXECUTE FUNCTION public.partner_audit_prospect_owner();

-- updated_at triggers
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prospects_updated BEFORE UPDATE ON public.partner_prospects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_demos_updated BEFORE UPDATE ON public.partner_demos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_attr_updated BEFORE UPDATE ON public.partner_attributions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payouts_updated BEFORE UPDATE ON public.partner_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_flags_updated BEFORE UPDATE ON public.partner_review_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_materials_updated BEFORE UPDATE ON public.partner_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Accept current agreement and activate (called by the invited user)
CREATE OR REPLACE FUNCTION public.accept_partner_agreement(p_agreement_id uuid, p_user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner public.partners; v_ag public.partner_agreements; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_partner FROM public.partners
   WHERE user_id = auth.uid() OR (user_id IS NULL AND lower(invite_email) = v_email)
   ORDER BY (user_id = auth.uid()) DESC NULLS LAST LIMIT 1;
  IF v_partner.id IS NULL THEN RAISE EXCEPTION 'No partner invitation for this account'; END IF;
  IF v_partner.status = 'suspended' THEN RAISE EXCEPTION 'Partner account suspended'; END IF;
  SELECT * INTO v_ag FROM public.partner_agreements WHERE id = p_agreement_id AND published_at IS NOT NULL;
  IF v_ag.id IS NULL THEN RAISE EXCEPTION 'Agreement not found'; END IF;
  INSERT INTO public.partner_agreement_acceptances(partner_id, agreement_id, version, user_agent)
  VALUES (v_partner.id, v_ag.id, v_ag.version, left(p_user_agent, 500))
  ON CONFLICT (partner_id, agreement_id) DO NOTHING;
  UPDATE public.partners SET user_id = auth.uid(), status = 'active', activated_at = COALESCE(activated_at, now())
   WHERE id = v_partner.id;
  INSERT INTO public.user_roles(user_id, role) SELECT auth.uid(), 'partner'::public.app_role
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'partner');
  RETURN v_partner.id;
END $$;
REVOKE ALL ON FUNCTION public.accept_partner_agreement(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_agreement(uuid, text) TO authenticated;

-- Partner access state for the current user
CREATE OR REPLACE FUNCTION public.my_partner_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_partner public.partners; v_latest public.partner_agreements; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('state','none'); END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_partner FROM public.partners
   WHERE user_id = auth.uid() OR (user_id IS NULL AND lower(invite_email) = v_email) LIMIT 1;
  IF v_partner.id IS NULL THEN RETURN jsonb_build_object('state','none'); END IF;
  IF v_partner.status = 'suspended' THEN RETURN jsonb_build_object('state','suspended'); END IF;
  SELECT * INTO v_latest FROM public.partner_agreements WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.partner_agreement_acceptances WHERE partner_id = v_partner.id AND agreement_id = v_latest.id) INTO v_ok;
  RETURN jsonb_build_object(
    'state', CASE WHEN v_partner.status = 'active' AND v_ok THEN 'active' ELSE 'needs_agreement' END,
    'partner_id', v_partner.id, 'referral_code', v_partner.referral_code, 'display_name', v_partner.display_name,
    'agreement', CASE WHEN v_latest.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_latest.id, 'version', v_latest.version, 'title', v_latest.title, 'body', v_latest.body) END);
END $$;
REVOKE ALL ON FUNCTION public.my_partner_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_partner_access() TO authenticated;

-- Admin: invite partner with initial rate versions
CREATE OR REPLACE FUNCTION public.admin_invite_partner(p_email text, p_display_name text, p_assisted_rate numeric DEFAULT NULL, p_closed_rate numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_code text; c public.partner_program_config; v_uid uuid;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  SELECT * INTO c FROM public.partner_program_config LIMIT 1;
  LOOP
    v_code := upper(substr(regexp_replace(COALESCE(p_display_name, split_part(p_email,'@',1)), '[^A-Za-z]', '', 'g'), 1, 6)) || lpad((floor(random()*10000))::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE referral_code = v_code);
  END LOOP;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  INSERT INTO public.partners(invite_email, display_name, referral_code, invited_by, user_id)
  VALUES (lower(p_email), p_display_name, v_code, auth.uid(), v_uid) RETURNING id INTO v_id;
  INSERT INTO public.partner_rate_versions(partner_id, commission_type, rate, months, holding_monthly_days, holding_annual_days, created_by, reason)
  VALUES (v_id, 'assisted', COALESCE(p_assisted_rate, c.default_assisted_rate), c.default_months, c.holding_monthly_days, c.holding_annual_days, auth.uid(), 'initial'),
         (v_id, 'closed', COALESCE(p_closed_rate, c.default_closed_rate), c.default_months, c.holding_monthly_days, c.holding_annual_days, auth.uid(), 'initial');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_invite_partner(text, text, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_partner(text, text, numeric, numeric) TO authenticated;

-- Seed v1 agreement
INSERT INTO public.partner_agreements(version, title, body, published_at) VALUES ('1.0', 'Ringster Sales Partner Agreement',
'1. Independent contractor. You are not an employee or agent of Ringster and may not bind Ringster to any contract.
2. Approved pricing only. Quote only pricing and features shown in the Partner Dashboard.
3. Outreach standards. You will comply with applicable anti-spam and telemarketing laws, including CASL (Canada) and TCPA/CAN-SPAM (US). Obtain and record consent where required, honour opt-out requests immediately, and never misrepresent Ringster.
4. Prospect registration. Registered prospects are protected for 90 days, conditional on documented outreach within 14 days. Ringster may reassign inactive or disputed prospects after review.
5. Commissions. Commission is paid only on verified, collected, eligible recurring subscription revenue for 12 months from the first eligible payment, excluding taxes, number rental, usage overages and credit top-ups. Commission type and rate are determined by Ringster. Refunds, credits and chargebacks reverse commission, including after payout.
6. Payouts. Earned commission is approved manually and paid monthly on the 15th, subject to a $50 minimum; smaller balances carry forward.
7. No self-referrals. Commission is not payable on your own accounts or accounts you control.
8. Confidentiality. Customer and prospect data is confidential and may be used only to sell Ringster.
9. Termination. Either party may end this agreement at any time. Earned, approved commissions remain payable.', now());
