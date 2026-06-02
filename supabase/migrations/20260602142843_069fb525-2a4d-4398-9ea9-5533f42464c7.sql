-- Revoke column-level access to OAuth tokens from client roles.
-- Edge functions use service_role which retains full access.

REVOKE SELECT (access_token, refresh_token) ON public.google_integrations FROM authenticated, anon;
REVOKE INSERT (access_token, refresh_token), UPDATE (access_token, refresh_token) ON public.google_integrations FROM authenticated, anon;

REVOKE SELECT (access_token, refresh_token) ON public.microsoft_integrations FROM authenticated, anon;
REVOKE INSERT (access_token, refresh_token), UPDATE (access_token, refresh_token) ON public.microsoft_integrations FROM authenticated, anon;

-- Ensure service_role keeps full access (idempotent)
GRANT ALL ON public.google_integrations TO service_role;
GRANT ALL ON public.microsoft_integrations TO service_role;