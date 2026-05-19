
-- Revoke broad EXECUTE on all public SECURITY DEFINER functions, then grant back narrowly.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'gbt_%'
      AND p.proname NOT LIKE 'gbtreekey%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
                   fn.proname, fn.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role;',
                   fn.proname, fn.args);
  END LOOP;
END $$;

-- Grant EXECUTE to authenticated only for functions the frontend legitimately calls via supabase.rpc:
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_unused_addon_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_live_coach_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
