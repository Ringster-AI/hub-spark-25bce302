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
    UPDATE public.partner_attributions SET status = 'active', approved_by = auth.uid(), approved_at = now(), updated_at = now() WHERE id = p_id;
  ELSIF p_action IN ('reject','revoke') THEN
    UPDATE public.partner_attributions SET status = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'revoked' END, updated_at = now() WHERE id = p_id;
  ELSIF p_action = 'set_type' THEN
    IF p_type NOT IN ('assisted','closed','custom') THEN RAISE EXCEPTION 'Invalid commission type'; END IF;
    IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE attribution_id = p_id) THEN
      RAISE EXCEPTION 'Commissions already exist; changes must be made as adjustments';
    END IF;
    SELECT * INTO cfg FROM public.partner_program_config LIMIT 1;
    rv := public.partner_rate_for(a.partner_id, p_type);
    UPDATE public.partner_attributions SET commission_type = p_type, rate_version_id = rv.id,
      rate_snapshot = coalesce(rv.rate, CASE WHEN p_type = 'closed' THEN cfg.default_closed_rate ELSE cfg.default_assisted_rate END),
      updated_at = now() WHERE id = p_id;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  INSERT INTO public.partner_audit_log (actor_id, entity, entity_id, action, before, after, reason)
  SELECT auth.uid(), 'partner_attributions', p_id, 'attribution_' || p_action, to_jsonb(a), to_jsonb(n), p_reason
    FROM public.partner_attributions n WHERE n.id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_attribution(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_attribution(uuid,text,text,text) TO authenticated, service_role;