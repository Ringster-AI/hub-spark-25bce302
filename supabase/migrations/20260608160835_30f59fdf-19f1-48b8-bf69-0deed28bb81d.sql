REVOKE EXECUTE ON FUNCTION public.get_my_team_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_access() TO authenticated, service_role;