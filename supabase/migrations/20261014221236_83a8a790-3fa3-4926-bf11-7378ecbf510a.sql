CREATE OR REPLACE FUNCTION public.admin_set_demo_outcome(p_demo uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.partner_demos;
BEGIN
  IF NOT public.is_partner_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('completed','no_show') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT * INTO d FROM public.partner_demos WHERE id = p_demo FOR UPDATE;
  IF d.id IS NULL OR d.status <> 'booked' THEN RAISE EXCEPTION 'Demo is not booked'; END IF;
  UPDATE public.partner_demos SET status = p_status WHERE id = p_demo;
  IF p_status = 'completed' THEN
    UPDATE public.partner_prospects SET status = 'demo_completed' WHERE id = d.prospect_id AND status = 'demo_booked';
  ELSE
    UPDATE public.partner_prospects SET status = 'qualified' WHERE id = d.prospect_id AND status = 'demo_booked';
  END IF;
  INSERT INTO public.partner_audit_log (actor_id, action, entity, entity_id, detail)
  VALUES (auth.uid(), 'demo_outcome', 'partner_demos', p_demo, jsonb_build_object('status', p_status));
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_demo_outcome(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_demo_outcome(uuid, text) TO authenticated, service_role;