CREATE TABLE public.partner_house_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text,
  email text,
  phone text,
  domain text,
  note text,
  norm_business text,
  norm_email text,
  norm_phone text,
  norm_domain text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.partner_house_accounts TO authenticated;
GRANT ALL ON public.partner_house_accounts TO service_role;
ALTER TABLE public.partner_house_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages house list" ON public.partner_house_accounts FOR ALL TO authenticated
  USING (public.is_partner_admin(auth.uid())) WITH CHECK (public.is_partner_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.pn_email(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(lower(trim(v)), '') $$;
CREATE OR REPLACE FUNCTION public.pn_phone(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(v,''), '\D', '', 'g'), 10), '') $$;
CREATE OR REPLACE FUNCTION public.pn_domain(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(v,''))), '^[a-z]+://', ''), '^www\.', ''), '[/:?#].*$', ''), '') $$;
CREATE OR REPLACE FUNCTION public.pn_business(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(trim(regexp_replace(regexp_replace(lower(coalesce(v,'')), '[^a-z0-9 ]', ' ', 'g'),
    '\m(the|inc|incorporated|llc|ltd|limited|corp|corporation|co|company)\M', ' ', 'g')), '') $$;
CREATE OR REPLACE FUNCTION public.pn_compact(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(lower(coalesce(v,'')), '[^a-z0-9]', '', 'g'), '') $$;

CREATE OR REPLACE FUNCTION public.house_norm() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.norm_business := replace(public.pn_business(NEW.business_name), ' ', '');
  NEW.norm_email := public.pn_email(NEW.email);
  NEW.norm_phone := public.pn_phone(NEW.phone);
  NEW.norm_domain := public.pn_domain(NEW.domain);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_house_norm BEFORE INSERT OR UPDATE ON public.partner_house_accounts
  FOR EACH ROW EXECUTE FUNCTION public.house_norm();

-- protection sweep + volume flags
CREATE OR REPLACE FUNCTION public.partner_sweep_protection() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; r record;
BEGIN
  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
  UPDATE public.partner_prospects SET protection_status = 'released', updated_at = now()
   WHERE protection_status IN ('protected','review_needed') AND protected_until < now()
     AND status NOT IN ('signed_up','paying');
  UPDATE public.partner_prospects SET protection_status = 'review_needed', updated_at = now()
   WHERE protection_status = 'protected' AND activity_deadline < now()
     AND status NOT IN ('signed_up','paying','demo_booked','demo_completed');
  FOR r IN
    SELECT partner_id,
           count(*) FILTER (WHERE created_at > now() - interval '14 days') AS recent,
           count(*) FILTER (WHERE protection_status IN ('protected','review_needed')) AS active,
           count(*) FILTER (WHERE status <> 'registered') AS progressed,
           count(*) FILTER (WHERE protection_status = 'review_needed') AS stale,
           count(*) AS total
      FROM public.partner_prospects GROUP BY partner_id
  LOOP
    IF (r.recent > (cfg.volume_flag->>'registered_14d')::int OR r.active > (cfg.volume_flag->>'active_claims')::int)
       AND r.progressed::numeric / GREATEST(r.total,1) < (cfg.volume_flag->>'min_contacted_ratio')::numeric
       AND NOT EXISTS (SELECT 1 FROM public.partner_review_flags f WHERE f.partner_id = r.partner_id AND f.kind = 'high_volume_low_progress' AND f.status = 'open') THEN
      INSERT INTO public.partner_review_flags (partner_id, kind, details)
      VALUES (r.partner_id, 'high_volume_low_progress', jsonb_build_object('recent_14d', r.recent, 'active', r.active, 'progressed', r.progressed, 'total', r.total));
    END IF;
    IF r.total >= 10 AND r.stale::numeric / r.total > (cfg.volume_flag->>'stale_ratio')::numeric
       AND NOT EXISTS (SELECT 1 FROM public.partner_review_flags f WHERE f.partner_id = r.partner_id AND f.kind = 'stale_claims' AND f.status = 'open') THEN
      INSERT INTO public.partner_review_flags (partner_id, kind, details)
      VALUES (r.partner_id, 'stale_claims', jsonb_build_object('stale', r.stale, 'total', r.total));
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_partner_prospect(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid := public.current_partner_id();
  cfg record;
  v_name text := trim(coalesce(p->>'business_name',''));
  v_email text := public.pn_email(p->>'email');
  v_phone text := public.pn_phone(p->>'phone');
  v_biz text := public.pn_business(p->>'business_name');
  v_city text := public.pn_compact(p->>'city');
  v_street text := public.pn_compact(p->>'street');
  v_label text := coalesce(public.pn_compact(p->>'location_label'), '');
  v_entity text := coalesce(NULLIF(p->>'purchasing_entity',''), 'unknown');
  v_domain text;
  v_key text;
  hit record;
  new_id uuid;
BEGIN
  IF pid IS NULL THEN RAISE EXCEPTION 'Partner access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = pid AND status = 'active') THEN RAISE EXCEPTION 'Partner account is not active'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'Business name is required'; END IF;
  IF v_city IS NULL THEN RAISE EXCEPTION 'City is required'; END IF;
  IF v_email IS NULL AND v_phone IS NULL AND p->>'website' IS NULL THEN RAISE EXCEPTION 'Add an email, phone or website'; END IF;
  IF v_entity NOT IN ('independent','parent_controlled','unknown') THEN RAISE EXCEPTION 'Invalid purchasing entity'; END IF;

  PERFORM public.partner_sweep_protection();
  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;

  v_domain := public.pn_domain(p->>'website');
  IF v_domain IS NULL AND v_email IS NOT NULL AND split_part(v_email,'@',2) NOT IN
     ('gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','live.com','msn.com','proton.me','protonmail.com','me.com','yahoo.ca','rogers.com','bell.net','shaw.ca','sympatico.ca') THEN
    v_domain := split_part(v_email,'@',2);
  END IF;
  v_key := replace(coalesce(v_biz,''),' ','') || '|' || v_city || '|' || coalesce(v_street, v_label);

  -- serialize registrations of the same business
  PERFORM pg_advisory_xact_lock(hashtext('prospect:' || replace(coalesce(v_biz,''),' ','') || v_city));

  -- existing Ringster customers
  IF EXISTS (SELECT 1 FROM public.profiles pr WHERE (v_email IS NOT NULL AND lower(pr.email) = v_email)
             OR (v_phone IS NOT NULL AND public.pn_phone(pr.phone) = v_phone)
             OR (v_domain IS NOT NULL AND public.pn_domain(pr.website) = v_domain)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This prospect is unavailable.');
  END IF;
  -- house list
  IF EXISTS (SELECT 1 FROM public.partner_house_accounts h WHERE (v_email IS NOT NULL AND h.norm_email = v_email)
             OR (v_phone IS NOT NULL AND h.norm_phone = v_phone)
             OR (v_domain IS NOT NULL AND h.norm_domain = v_domain)
             OR (h.norm_business IS NOT NULL AND h.norm_business = replace(coalesce(v_biz,''),' ',''))) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This prospect is unavailable.');
  END IF;

  SELECT * INTO hit FROM public.partner_prospects x
   WHERE x.protection_status IN ('protected','review_needed','disputed')
     AND (x.protected_until > now() OR x.status IN ('signed_up','paying'))
     AND ((v_email IS NOT NULL AND x.norm_email = v_email)
       OR (v_phone IS NOT NULL AND x.norm_phone = v_phone)
       OR x.match_key_business = v_key
       OR (v_domain IS NOT NULL AND x.norm_domain = v_domain AND coalesce(public.pn_compact(x.location_label),'') = v_label))
   ORDER BY (x.partner_id = pid) DESC, x.created_at LIMIT 1;

  IF FOUND THEN
    IF hit.partner_id = pid THEN
      RETURN jsonb_build_object('ok', false, 'message', 'You already registered this prospect.', 'prospect_id', hit.id);
    END IF;
    IF hit.purchasing_entity = 'parent_controlled' OR v_entity = 'parent_controlled' THEN
      INSERT INTO public.partner_review_flags (partner_id, kind, subject_id, details)
      VALUES (pid, 'dispute', hit.id, jsonb_build_object('reason','parent_controlled_location_overlap','submitted', p - 'notes'));
    END IF;
    RETURN jsonb_build_object('ok', false, 'message', 'This prospect is unavailable.');
  END IF;

  INSERT INTO public.partner_prospects (partner_id, business_name, contact_name, email, phone, website, industry, industry_other,
     lead_source, location_label, street, city, postal_code, purchasing_entity, norm_email, norm_phone, norm_business, norm_domain,
     match_key_business, notes, protected_until, activity_deadline, next_follow_up_at)
  VALUES (pid, v_name, NULLIF(p->>'contact_name',''), NULLIF(p->>'email',''), NULLIF(p->>'phone',''), NULLIF(p->>'website',''),
     NULLIF(p->>'industry',''), NULLIF(p->>'industry_other',''), NULLIF(p->>'lead_source',''), NULLIF(p->>'location_label',''),
     NULLIF(p->>'street',''), trim(p->>'city'), NULLIF(p->>'postal_code',''), v_entity, v_email, v_phone, v_biz, v_domain, v_key,
     NULLIF(p->>'notes',''), now() + make_interval(days => cfg.protection_days), now() + make_interval(days => cfg.activity_deadline_days),
     NULLIF(p->>'next_follow_up_at','')::timestamptz)
  RETURNING id INTO new_id;

  INSERT INTO public.partner_activities (prospect_id, partner_id, type, summary)
  VALUES (new_id, pid, 'system', 'Prospect registered');

  PERFORM public.partner_sweep_protection();
  RETURN jsonb_build_object('ok', true, 'prospect_id', new_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_prospect_protection(p_prospect_id uuid, p_action text, p_new_partner uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
  IF p_action = 'release' THEN
    UPDATE public.partner_prospects SET protection_status = 'released', updated_at = now() WHERE id = p_prospect_id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.partner_prospects SET protection_status = 'protected',
      activity_deadline = LEAST(protected_until, now() + make_interval(days => cfg.activity_deadline_days)), updated_at = now()
     WHERE id = p_prospect_id;
  ELSIF p_action = 'reassign' THEN
    IF p_new_partner IS NULL THEN RAISE EXCEPTION 'New partner required'; END IF;
    UPDATE public.partner_prospects SET partner_id = p_new_partner, protection_status = 'protected',
      protected_until = now() + make_interval(days => cfg.protection_days),
      activity_deadline = now() + make_interval(days => cfg.activity_deadline_days), updated_at = now()
     WHERE id = p_prospect_id;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  INSERT INTO public.partner_activities (prospect_id, partner_id, type, summary)
  SELECT id, partner_id, 'system', 'Admin ' || p_action || ': ' || p_reason FROM public.partner_prospects WHERE id = p_prospect_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_partner_flag(p_flag_id uuid, p_status text, p_resolution text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_status NOT IN ('resolved','dismissed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.partner_review_flags SET status = p_status, resolution = p_resolution, resolved_by = auth.uid(), updated_at = now()
   WHERE id = p_flag_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.partner_sweep_protection() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_partner_prospect(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_prospect_protection(uuid,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_partner_flag(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_sweep_protection() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_partner_prospect(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_prospect_protection(uuid,text,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_partner_flag(uuid,text,text) TO authenticated, service_role;