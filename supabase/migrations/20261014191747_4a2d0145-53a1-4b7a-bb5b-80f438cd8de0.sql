REVOKE ALL ON public.partner_house_accounts FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_sweep_protection() FROM authenticated;