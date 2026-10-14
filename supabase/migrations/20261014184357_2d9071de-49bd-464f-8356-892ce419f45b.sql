DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['partners','partner_rate_versions','partner_agreements','partner_agreement_acceptances','partner_program_config','partner_prospects','partner_activities','partner_demo_settings','partner_demos','referral_touches','partner_attributions','stripe_webhook_events','partner_payouts','partner_commissions','partner_review_flags','partner_materials','partner_audit_log'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
REVOKE ALL ON public.stripe_webhook_events FROM authenticated;
REVOKE ALL ON SEQUENCE public.partner_audit_log_id_seq FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_partner_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_partner_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_partner_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_partner_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.guard_prospect_update() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_partner_activity() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_audit() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_audit_prospect_owner() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_commission_immutable() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_append_only() FROM public, anon, authenticated;