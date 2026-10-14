CREATE OR REPLACE FUNCTION public.partner_account_owner(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT owner_user_id FROM public.team_members
                    WHERE member_user_id = p_user AND status = 'active' AND revoked_at IS NULL LIMIT 1), p_user) $$;

CREATE OR REPLACE FUNCTION public.partner_is_self_referral(p_partner uuid, p_account uuid, p_stripe_customer text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pu uuid; pe text; pp text; ae text; ap text; pcust text;
BEGIN
  SELECT user_id, lower(invite_email) INTO pu, pe FROM public.partners WHERE id = p_partner;
  IF pu IS NOT NULL AND (pu = p_account OR public.partner_account_owner(pu) = p_account) THEN RETURN 'partner_is_account_or_member'; END IF;
  IF pu IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members WHERE owner_user_id = pu AND member_user_id = p_account) THEN RETURN 'account_is_partner_team_member'; END IF;
  SELECT lower(email), public.pn_phone(phone) INTO ae, ap FROM public.profiles WHERE id = p_account;
  SELECT public.pn_phone(phone), (SELECT stripe_customer_id FROM public.user_subscriptions WHERE user_id = pu LIMIT 1)
    INTO pp, pcust FROM public.profiles WHERE id = pu;
  IF ae IS NOT NULL AND (ae = pe OR ae = (SELECT lower(email) FROM public.profiles WHERE id = pu)) THEN RETURN 'same_email'; END IF;
  IF ap IS NOT NULL AND ap = pp THEN RETURN 'same_phone'; END IF;
  IF p_stripe_customer IS NOT NULL AND p_stripe_customer = pcust THEN RETURN 'same_stripe_customer'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.record_referral_touch(p_code text, p_source text, p_landing_url text, p_user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE part record; acct uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_source NOT IN ('link','code') THEN RAISE EXCEPTION 'Invalid source'; END IF;
  SELECT * INTO part FROM public.partners WHERE upper(referral_code) = upper(trim(p_code)) AND status = 'active';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'That referral code is not valid.'); END IF;
  acct := public.partner_account_owner(auth.uid());
  IF public.partner_is_self_referral(part.id, acct, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'You can''t use your own referral code.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_touches WHERE user_id = acct AND partner_id = part.id AND source = p_source
             AND created_at > now() - interval '1 day') THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  INSERT INTO public.referral_touches (partner_id, user_id, code, source, landing_url, user_agent)
  VALUES (part.id, acct, part.referral_code, p_source, left(p_landing_url, 500), left(p_user_agent, 500));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.partner_rate_for(p_partner uuid, p_type text)
RETURNS public.partner_rate_versions LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.partner_rate_versions WHERE partner_id = p_partner AND commission_type = p_type AND effective_from <= now()
  ORDER BY effective_from DESC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.partner_insert_attribution(p_account uuid, p_partner uuid, p_prospect uuid, p_method text,
  p_kind text, p_type text, p_status text, p_paid_at timestamptz, p_evidence jsonb, p_approved_by uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; rv public.partner_rate_versions; ag text; new_id uuid; months int;
BEGIN
  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
  rv := public.partner_rate_for(p_partner, p_type);
  months := coalesce(rv.months, cfg.default_months);
  SELECT a.version INTO ag FROM public.partner_agreement_acceptances x JOIN public.partner_agreements a ON a.id = x.agreement_id
   WHERE x.partner_id = p_partner ORDER BY x.accepted_at DESC LIMIT 1;
  INSERT INTO public.partner_attributions (account_id, partner_id, prospect_id, method, conversion_kind, commission_type, rate_version_id,
    rate_snapshot, months_snapshot, holding_monthly_days, holding_annual_days, agreement_version, eligibility_starts_at, eligibility_ends_at,
    status, match_evidence, approved_by, approved_at)
  VALUES (p_account, p_partner, p_prospect, p_method, p_kind, p_type, rv.id,
    coalesce(rv.rate, CASE WHEN p_type = 'closed' THEN cfg.default_closed_rate ELSE cfg.default_assisted_rate END),
    months, coalesce(rv.holding_monthly_days, cfg.holding_monthly_days), coalesce(rv.holding_annual_days, cfg.holding_annual_days), ag,
    p_paid_at, CASE WHEN p_paid_at IS NULL THEN NULL ELSE p_paid_at + make_interval(months => months) END,
    p_status, coalesce(p_evidence,'{}'), p_approved_by, CASE WHEN p_approved_by IS NULL THEN NULL ELSE now() END)
  RETURNING id INTO new_id;
  IF p_prospect IS NOT NULL THEN
    UPDATE public.partner_prospects SET status = CASE WHEN p_paid_at IS NULL THEN 'signed_up' ELSE 'paying' END,
      converted_account_id = p_account, updated_at = now() WHERE id = p_prospect;
    INSERT INTO public.partner_activities (prospect_id, partner_id, type, summary)
    VALUES (p_prospect, p_partner, 'system', 'Converted to a Ringster account (' || p_method || ')');
  END IF;
  RETURN new_id;
END $$;

-- Called by stripe-webhook (service role) on an eligible paid subscription invoice.
CREATE OR REPLACE FUNCTION public.claim_partner_attribution(p_account uuid, p_stripe_customer text, p_paid_at timestamptz, p_prior_paid boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record; existing record; cand record; acct_created timestamptz; pr record;
  v_partner uuid; v_prospect uuid; v_method text; v_evidence jsonb := '{}'; self text; v_kind text; v_status text; new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('attr:' || p_account::text));
  SELECT * INTO existing FROM public.partner_attributions WHERE account_id = p_account AND status IN ('pending_approval','active','ended')
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    IF existing.eligibility_starts_at IS NULL AND existing.status IN ('pending_approval','active') THEN
      UPDATE public.partner_attributions SET eligibility_starts_at = p_paid_at,
        eligibility_ends_at = p_paid_at + make_interval(months => months_snapshot), updated_at = now() WHERE id = existing.id;
      IF existing.prospect_id IS NOT NULL THEN
        UPDATE public.partner_prospects SET status = 'paying', updated_at = now() WHERE id = existing.prospect_id;
      END IF;
    END IF;
    RETURN jsonb_build_object('attribution_id', existing.id, 'status', existing.status, 'new', false);
  END IF;
  IF p_prior_paid THEN RETURN jsonb_build_object('status', 'none', 'reason', 'account_paid_before'); END IF;

  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
  SELECT * INTO pr FROM public.profiles WHERE id = p_account;
  acct_created := pr.created_at;

  -- 1) registered prospect match
  SELECT x.id, x.partner_id, x.created_at INTO cand FROM public.partner_prospects x JOIN public.partners pa ON pa.id = x.partner_id AND pa.status = 'active'
   WHERE x.protection_status IN ('protected','review_needed') AND x.protected_until > now()
     AND ((x.norm_email IS NOT NULL AND x.norm_email = lower(pr.email))
       OR (x.norm_phone IS NOT NULL AND x.norm_phone = public.pn_phone(pr.phone))
       OR (x.norm_domain IS NOT NULL AND x.norm_domain = public.pn_domain(pr.website))
       OR (x.norm_domain IS NOT NULL AND x.norm_domain = split_part(lower(pr.email),'@',2)))
   ORDER BY x.created_at LIMIT 1;
  IF FOUND THEN
    v_partner := cand.partner_id; v_prospect := cand.id; v_method := 'prospect_match';
    v_evidence := jsonb_build_object('prospect_id', cand.id, 'registered_at', cand.created_at);
  ELSE
    -- 2) code, 3) link (earliest qualifying touch)
    SELECT t.* INTO cand FROM public.referral_touches t JOIN public.partners pa ON pa.id = t.partner_id AND pa.status = 'active'
     WHERE t.user_id = p_account AND t.source IN ('code','checkout')
     ORDER BY t.created_at LIMIT 1;
    IF FOUND THEN v_method := 'code';
    ELSE
      SELECT t.* INTO cand FROM public.referral_touches t JOIN public.partners pa ON pa.id = t.partner_id AND pa.status = 'active'
       WHERE t.user_id = p_account AND t.source = 'link' AND t.created_at > p_paid_at - make_interval(days => cfg.link_touch_days)
       ORDER BY t.created_at LIMIT 1;
      IF FOUND THEN v_method := 'link'; END IF;
    END IF;
    IF v_method IS NULL THEN RETURN jsonb_build_object('status', 'none'); END IF;
    v_partner := cand.partner_id;
    v_evidence := jsonb_build_object('touch_id', cand.id, 'touched_at', cand.created_at, 'source', cand.source);
  END IF;

  self := public.partner_is_self_referral(v_partner, p_account, p_stripe_customer);
  IF self IS NOT NULL THEN
    INSERT INTO public.partner_review_flags (partner_id, kind, subject_id, details)
    VALUES (v_partner, 'self_referral_suspect', p_account, v_evidence || jsonb_build_object('reason', self));
    RETURN jsonb_build_object('status', 'blocked', 'reason', self);
  END IF;

  -- existing (pre-touch) free accounts need admin approval
  IF acct_created < coalesce((v_evidence->>'registered_at')::timestamptz, (v_evidence->>'touched_at')::timestamptz) THEN
    v_kind := 'existing_free_account'; v_status := 'pending_approval';
  ELSE
    v_kind := 'new_signup'; v_status := 'active';
  END IF;
  new_id := public.partner_insert_attribution(p_account, v_partner, v_prospect, v_method, v_kind, 'assisted', v_status, p_paid_at,
    v_evidence || jsonb_build_object('stripe_customer', p_stripe_customer), NULL);
  RETURN jsonb_build_object('attribution_id', new_id, 'status', v_status, 'new', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_manual_attribution(p_account_email text, p_partner uuid, p_type text, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct uuid; self text; paid timestamptz;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Reason required'; END IF;
  IF p_type NOT IN ('assisted','closed','custom') THEN RAISE EXCEPTION 'Invalid commission type'; END IF;
  SELECT id INTO acct FROM public.profiles WHERE lower(email) = lower(trim(p_account_email));
  IF acct IS NULL THEN RAISE EXCEPTION 'No Ringster account with that email'; END IF;
  acct := public.partner_account_owner(acct);
  IF EXISTS (SELECT 1 FROM public.partner_attributions WHERE account_id = acct AND status IN ('pending_approval','active','ended')) THEN
    RAISE EXCEPTION 'This account is already credited to a partner. Revoke that first.';
  END IF;
  self := public.partner_is_self_referral(p_partner, acct, NULL);
  IF self IS NOT NULL THEN RAISE EXCEPTION 'Self-referral blocked (%)', self; END IF;
  RETURN public.partner_insert_attribution(acct, p_partner, NULL, 'manual', 'existing_free_account', p_type, 'active', NULL,
    jsonb_build_object('reason', p_reason), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_attribution(p_id uuid, p_action text, p_type text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; rv public.partner_rate_versions; cfg record;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT * INTO a FROM public.partner_attributions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF p_action = 'approve' THEN
    IF a.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only pending credits can be approved'; END IF;
    UPDATE public.partner_attributions SET status = 'active', approved_by = auth.uid(), approved_at = now(),
      match_evidence = match_evidence || jsonb_build_object('approval_reason', p_reason), updated_at = now() WHERE id = p_id;
  ELSIF p_action IN ('reject','revoke') THEN
    UPDATE public.partner_attributions SET status = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'revoked' END,
      match_evidence = match_evidence || jsonb_build_object(p_action || '_reason', p_reason), updated_at = now() WHERE id = p_id;
  ELSIF p_action = 'set_type' THEN
    IF p_type NOT IN ('assisted','closed','custom') THEN RAISE EXCEPTION 'Invalid commission type'; END IF;
    IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE attribution_id = p_id) THEN
      RAISE EXCEPTION 'Commissions already exist; changes must be made as adjustments';
    END IF;
    SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
    rv := public.partner_rate_for(a.partner_id, p_type);
    UPDATE public.partner_attributions SET commission_type = p_type, rate_version_id = rv.id,
      rate_snapshot = coalesce(rv.rate, CASE WHEN p_type = 'closed' THEN cfg.default_closed_rate ELSE cfg.default_assisted_rate END),
      match_evidence = match_evidence || jsonb_build_object('type_change_reason', p_reason), updated_at = now() WHERE id = p_id;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  INSERT INTO public.partner_audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'attribution_' || p_action, 'partner_attributions', p_id, jsonb_build_object('reason', p_reason, 'type', p_type));
END $$;

REVOKE EXECUTE ON FUNCTION public.partner_account_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_is_self_referral(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_rate_for(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_insert_attribution(uuid,uuid,uuid,text,text,text,text,timestamptz,jsonb,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_partner_attribution(uuid,text,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_referral_touch(text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_manual_attribution(text,uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_attribution(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_partner_attribution(uuid,text,timestamptz,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_account_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_referral_touch(text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_attribution(text,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_attribution(uuid,text,text,text) TO authenticated, service_role;