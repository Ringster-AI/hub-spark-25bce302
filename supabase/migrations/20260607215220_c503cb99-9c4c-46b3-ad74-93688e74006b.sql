CREATE OR REPLACE FUNCTION public.get_my_team_access()
RETURNS TABLE(role text, can_listen boolean, can_transfer boolean, receives_notifications boolean, is_owner boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- A user is an "owner" if they own resources of their own
  -- (i.e. they have their own agent_configs or active_calls -- basically a real account).
  -- We treat every authenticated user as the owner of their own workspace by default.
  v_is_owner := true;

  -- If they have a team_members row as a member, return that (member view takes precedence
  -- only when they're actually a team member of someone else).
  RETURN QUERY
  SELECT tm.role::text,
         tm.can_listen,
         tm.can_transfer,
         tm.receives_notifications,
         false AS is_owner
  FROM public.team_members tm
  WHERE tm.member_user_id = v_uid
    AND tm.status = 'active'
  ORDER BY tm.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- No team_members row -> the signed-in user is the owner of their own account.
  RETURN QUERY SELECT 'owner'::text, true, true, true, true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_access() TO authenticated;