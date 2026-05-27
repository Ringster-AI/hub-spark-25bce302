
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

CREATE POLICY "Super admins can view all agents"
ON public.agent_configs FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all agents"
ON public.agent_configs FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete all agents"
ON public.agent_configs FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all call logs"
ON public.call_logs FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all call recordings"
ON public.call_recordings FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage all calendar tools"
ON public.calendar_tools FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
