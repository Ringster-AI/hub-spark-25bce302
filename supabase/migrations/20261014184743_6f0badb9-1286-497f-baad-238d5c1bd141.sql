ALTER TABLE public.partners
  ADD COLUMN country text,
  ADD COLUMN payout_method text,
  ADD COLUMN payout_contact text,
  ADD COLUMN payout_method_approved_at timestamptz,
  ADD COLUMN payout_method_approved_by uuid;

ALTER TABLE public.partner_program_config
  ADD COLUMN approved_payout_methods text[] NOT NULL DEFAULT ARRAY['interac_etransfer','wise','paypal','wire'];

CREATE OR REPLACE FUNCTION public.admin_set_partner_payout(p_partner_id uuid, p_country text, p_method text, p_contact text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_allowed text[]; v_country text; v_method text;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  v_country := upper(nullif(trim(p_country), ''));
  IF v_country IS NULL OR length(v_country) <> 2 THEN RAISE EXCEPTION 'Country must be a 2-letter code'; END IF;
  v_method := COALESCE(nullif(trim(p_method), ''), CASE WHEN v_country = 'CA' THEN 'interac_etransfer' END);
  SELECT approved_payout_methods INTO v_allowed FROM public.partner_program_config LIMIT 1;
  IF v_method IS NULL OR NOT (v_method = ANY(v_allowed)) THEN RAISE EXCEPTION 'Payout method is not on the approved list'; END IF;
  IF v_method = 'interac_etransfer' AND v_country <> 'CA' THEN RAISE EXCEPTION 'Interac e-transfer is for Canadian partners only'; END IF;
  IF nullif(trim(p_contact), '') IS NULL THEN RAISE EXCEPTION 'Payout contact is required'; END IF;
  PERFORM set_config('partner.audit_reason', COALESCE(p_reason, 'payout method update'), true);
  UPDATE public.partners SET country = v_country, payout_method = v_method, payout_contact = left(trim(p_contact), 200),
    payout_method_approved_at = now(), payout_method_approved_by = auth.uid()
   WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_partner_payout(uuid, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_payout(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_payout_method()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.partners; v_allowed text[];
BEGIN
  IF NEW.status IN ('approved','paid') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    SELECT * INTO p FROM public.partners WHERE id = NEW.partner_id;
    SELECT approved_payout_methods INTO v_allowed FROM public.partner_program_config LIMIT 1;
    IF p.payout_method IS NULL OR p.payout_method_approved_at IS NULL OR NOT (p.payout_method = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Partner has no approved payout method';
    END IF;
    IF NEW.status = 'paid' THEN
      IF NEW.method IS DISTINCT FROM p.payout_method THEN RAISE EXCEPTION 'Payout must use the partner''s approved method (%)', p.payout_method; END IF;
      IF nullif(trim(NEW.reference), '') IS NULL THEN RAISE EXCEPTION 'Payment reference is required'; END IF;
      NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_payout_method() FROM public, anon, authenticated;
CREATE TRIGGER trg_guard_payout_method BEFORE INSERT OR UPDATE ON public.partner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_method();

-- Partners table: only admins update (existing policy already admin-only); payout fields edited via function above.

INSERT INTO public.partner_agreements(version, title, body, published_at) VALUES ('1.1', 'Ringster Sales Partner Agreement',
'1. Independent contractor. You are not an employee or agent of Ringster and may not bind Ringster to any contract.
2. Approved pricing only. Quote only pricing and features shown in the Partner Dashboard.
3. Outreach standards. You will comply with applicable anti-spam and telemarketing laws, including CASL (Canada) and TCPA/CAN-SPAM (US). Obtain and record consent where required, honour opt-out requests immediately, and never misrepresent Ringster.
4. Prospect registration. Registered prospects are protected for 90 days, conditional on documented outreach within 14 days. Ringster may reassign inactive or disputed prospects after review.
5. Commissionable revenue. Commission is paid only on verified, collected recurring base subscription fees and eligible subscription upgrades for 12 months from the customer''s first eligible payment. Taxes, number rental, usage overages and credit top-ups are excluded. Commission type and rate are determined by Ringster. Refunds, credits, downgrades and chargebacks reduce commission, including after payout.
6. Holding period. Commission becomes payable 30 days after payment for monthly plans and 45 days after payment for annual prepaid plans.
7. Payouts. Approved, payable commission is paid monthly on the 15th, subject to a $50 (or equivalent) minimum; smaller balances roll forward. Canadian partners are paid by Interac e-transfer; international partners are paid by another method approved by Ringster. Amounts are paid in the currency the customer was charged.
8. No self-referrals. Commission is not payable on your own accounts or accounts you control.
9. Confidentiality. Customer and prospect data is confidential and may be used only to sell Ringster.
10. Termination. Either party may end this agreement at any time. Earned, approved commissions remain payable.', now());