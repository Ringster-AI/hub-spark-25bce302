CREATE OR REPLACE FUNCTION public.partner_active_attribution(p_account uuid, p_at timestamptz)
RETURNS public.partner_attributions LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.partner_attributions WHERE account_id = p_account AND status = 'active'
     AND eligibility_starts_at IS NOT NULL AND p_at >= eligibility_starts_at - interval '1 day' AND p_at < eligibility_ends_at
   ORDER BY created_at LIMIT 1 $$;

-- positive entry for one eligible invoice line (service role)
CREATE OR REPLACE FUNCTION public.record_partner_commission_line(p_account uuid, p_event text, p_invoice text, p_line text,
  p_gross integer, p_excluded integer, p_currency text, p_interval text, p_occurred timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.partner_attributions; elig integer := p_gross - p_excluded; new_id uuid;
BEGIN
  a := public.partner_active_attribution(p_account, p_occurred);
  IF a.id IS NULL OR elig = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.partner_commissions (ledger_key, partner_id, attribution_id, account_id, source_type, stripe_event_id, stripe_object_id,
    invoice_id, invoice_line_id, gross_line_cents, excluded_cents, eligible_cents, rate_version_id, rate, amount_cents, currency,
    billing_interval, occurred_at, earn_after, status)
  VALUES ('inv:' || p_invoice || ':' || p_line, a.partner_id, a.id, p_account, 'invoice_line', p_event, p_line, p_invoice, p_line,
    p_gross, p_excluded, elig, a.rate_version_id, a.rate_snapshot, round(elig * a.rate_snapshot)::int, lower(p_currency), p_interval, p_occurred,
    p_occurred + make_interval(days => CASE WHEN p_interval = 'year' THEN a.holding_annual_days ELSE a.holding_monthly_days END),
    CASE WHEN elig < 0 THEN 'earned' ELSE 'pending' END)
  ON CONFLICT (ledger_key) DO NOTHING RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- reversal (negative ratio) or restoration (positive ratio) of an invoice's commission (service role)
CREATE OR REPLACE FUNCTION public.record_partner_commission_reversal(p_ledger_key text, p_source text, p_event text, p_object text,
  p_invoice text, p_ratio numeric, p_occurred timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base record; amt integer; elig integer; net integer; new_id uuid;
BEGIN
  IF p_source NOT IN ('credit_note_line','refund','dispute') THEN RAISE EXCEPTION 'bad source'; END IF;
  SELECT partner_id, attribution_id, account_id, max(currency) cur, max(rate) rate,
         sum(CASE WHEN source_type = 'invoice_line' THEN amount_cents ELSE 0 END) pos,
         sum(CASE WHEN source_type = 'invoice_line' THEN eligible_cents ELSE 0 END) pos_elig,
         sum(amount_cents) net
    INTO base FROM public.partner_commissions WHERE invoice_id = p_invoice
   GROUP BY partner_id, attribution_id, account_id LIMIT 1;
  IF base.partner_id IS NULL OR base.pos <= 0 THEN RETURN NULL; END IF;
  amt := round(base.pos * LEAST(GREATEST(p_ratio, -1), 1))::int;
  IF amt < 0 THEN amt := GREATEST(amt, -base.net); END IF;        -- never claw back more than remains
  IF amt > 0 THEN amt := LEAST(amt, base.pos - base.net); END IF;  -- never restore more than was reversed
  IF amt = 0 THEN RETURN NULL; END IF;
  elig := round(base.pos_elig * LEAST(GREATEST(p_ratio, -1), 1))::int;
  INSERT INTO public.partner_commissions (ledger_key, partner_id, attribution_id, account_id, source_type, stripe_event_id, stripe_object_id,
    invoice_id, gross_line_cents, eligible_cents, rate, amount_cents, currency, occurred_at, earn_after, status)
  VALUES (p_ledger_key, base.partner_id, base.attribution_id, base.account_id, p_source, p_event, p_object, p_invoice, elig, elig,
    base.rate, amt, base.cur, p_occurred, p_occurred, 'earned')
  ON CONFLICT (ledger_key) DO NOTHING RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.partner_earn_due() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.partner_commissions c SET status = 'earned'
   WHERE c.status = 'pending' AND c.earn_after <= now()
     AND EXISTS (SELECT 1 FROM public.partner_attributions a WHERE a.id = c.attribution_id AND a.status IN ('active','ended'));
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.partner_attributions SET status = 'ended', updated_at = now() WHERE status = 'active' AND eligibility_ends_at < now();
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_commission_adjustment(p_attribution uuid, p_amount_cents integer, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; new_id uuid; cur text;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF coalesce(trim(p_reason),'') = '' OR p_amount_cents = 0 THEN RAISE EXCEPTION 'Amount and reason required'; END IF;
  SELECT * INTO a FROM public.partner_attributions WHERE id = p_attribution;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT coalesce(max(currency),'usd') INTO cur FROM public.partner_commissions WHERE attribution_id = a.id;
  INSERT INTO public.partner_commissions (ledger_key, partner_id, attribution_id, account_id, source_type, eligible_cents, rate, amount_cents,
    currency, occurred_at, earn_after, status, reason, created_by)
  VALUES ('adj:' || gen_random_uuid(), a.partner_id, a.id, a.account_id, 'rate_adjustment', 0, a.rate_snapshot, p_amount_cents,
    cur, now(), now(), 'earned', p_reason, auth.uid())
  RETURNING id INTO new_id;
  INSERT INTO public.partner_audit_log (actor_id, entity, entity_id, action, after, reason)
  VALUES (auth.uid(), 'partner_commissions', new_id, 'manual_adjustment', jsonb_build_object('amount_cents', p_amount_cents), p_reason);
  RETURN new_id;
END $$;

-- monthly payout run: period 'YYYY-MM', paid on the configured day
CREATE OR REPLACE FUNCTION public.admin_build_payouts(p_period text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; r record; pid uuid; n integer := 0; d date;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_period !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Period must be YYYY-MM'; END IF;
  PERFORM public.partner_earn_due();
  SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
  d := make_date(split_part(p_period,'-',1)::int, split_part(p_period,'-',2)::int, cfg.payout_day);
  FOR r IN SELECT partner_id, currency, sum(amount_cents) total FROM public.partner_commissions
            WHERE status = 'earned' AND payout_id IS NULL GROUP BY partner_id, currency LOOP
    IF EXISTS (SELECT 1 FROM public.partner_payouts WHERE partner_id = r.partner_id AND period = p_period) THEN CONTINUE; END IF;
    IF r.total >= cfg.min_payout_cents THEN
      INSERT INTO public.partner_payouts (partner_id, period, scheduled_for, total_cents, currency, status)
      VALUES (r.partner_id, p_period, d, r.total, r.currency, 'draft') RETURNING id INTO pid;
      UPDATE public.partner_commissions SET payout_id = pid
       WHERE partner_id = r.partner_id AND currency = r.currency AND status = 'earned' AND payout_id IS NULL;
    ELSE
      INSERT INTO public.partner_payouts (partner_id, period, scheduled_for, total_cents, carried_forward_cents, currency, status)
      VALUES (r.partner_id, p_period, d, 0, GREATEST(r.total,0), r.currency, 'carried_forward');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_payout_status(p_payout uuid, p_status text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE po record; m text;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO po FROM public.partner_payouts WHERE id = p_payout FOR UPDATE;
  IF p_status = 'approved' AND po.status = 'draft' THEN
    UPDATE public.partner_payouts SET status = 'approved', approved_by = auth.uid(), updated_at = now() WHERE id = p_payout;
    UPDATE public.partner_commissions SET status = 'approved' WHERE payout_id = p_payout AND status = 'earned';
  ELSIF p_status = 'paid' AND po.status = 'approved' THEN
    SELECT payout_method INTO m FROM public.partners WHERE id = po.partner_id;
    UPDATE public.partner_payouts SET status = 'paid', method = m, reference = p_reference, recorded_by = auth.uid(), updated_at = now() WHERE id = p_payout;
    UPDATE public.partner_commissions SET status = 'paid' WHERE payout_id = p_payout;
  ELSE RAISE EXCEPTION 'Cannot move payout from % to %', po.status, p_status; END IF;
  INSERT INTO public.partner_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  VALUES (auth.uid(), 'partner_payouts', p_payout, 'payout_' || p_status, jsonb_build_object('status', po.status), jsonb_build_object('status', p_status), p_reference);
END $$;

REVOKE EXECUTE ON FUNCTION public.partner_active_attribution(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_partner_commission_line(uuid,text,text,text,integer,integer,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_partner_commission_reversal(text,text,text,text,text,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_earn_due() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_commission_adjustment(uuid,integer,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_build_payouts(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_payout_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_commission_line(uuid,text,text,text,integer,integer,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_partner_commission_reversal(text,text,text,text,text,numeric,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_earn_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_commission_adjustment(uuid,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_build_payouts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_payout_status(uuid,text,text) TO authenticated, service_role;

SELECT cron.schedule('partner-earn-due', '0 6 * * *', 'SELECT public.partner_earn_due()');