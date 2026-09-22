import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { redirectWithError } from "../_shared/responses.ts";
import { lookupOAuthState, deleteOAuthState } from "../_shared/supabase-admin.ts";
import { encryptToken } from "../_shared/crypto.ts";
import { sanitizeReturnUrl } from "../_shared/return-url.ts";

const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY");
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/microsoft-callback`;

interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

async function exchangeCodeForTokens(code: string, codeVerifier: string, requestId: string): Promise<MsTokenResponse> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[${requestId}] Microsoft token exchange failed:`, errBody);
    throw new Error(`Token exchange failed: ${resp.status} ${errBody}`);
  }

  return await resp.json();
}

async function fetchUserInfo(accessToken: string, requestId: string): Promise<{ id: string; email: string; name?: string }> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[${requestId}] Failed to fetch MS user info:`, errBody);
    throw new Error(`User info fetch failed: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    id: data.id,
    email: data.mail || data.userPrincipalName,
    name: data.displayName,
  };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] microsoft-callback received`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error(`[${requestId}] Missing Microsoft credentials`);
      return redirectWithError("server_config_error", requestId);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return redirectWithError("server_config_error", requestId);
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const state = url.searchParams.get("state") || "";

    if (error) {
      console.error(`[${requestId}] OAuth error: ${error} - ${errorDescription}`);
      return redirectWithError(error, requestId);
    }
    if (!code) return redirectWithError("no_code", requestId);
    if (!state) return redirectWithError("invalid_state", requestId);

    let stateData;
    try {
      stateData = await lookupOAuthState(state, requestId);
    } catch (e) {
      console.error(`[${requestId}] State lookup failed:`, e);
      return redirectWithError("database_error", requestId);
    }

    if (new Date(stateData.expires_at) < new Date()) {
      return redirectWithError("expired_state", requestId);
    }

    const { code_verifier: codeVerifier, return_url: returnUrl, user_id: userId } = stateData;

    if (!userId) {
      console.error(`[${requestId}] No user ID in state`);
      return redirectWithError("missing_user_id", requestId);
    }

    const tokenData = await exchangeCodeForTokens(code, codeVerifier, requestId);
    const userInfo = await fetchUserInfo(tokenData.access_token, requestId);
    console.log(`[${requestId}] Got Microsoft user: ${userInfo.email}`);

    const expiresInSeconds = tokenData.expires_in - 300;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    let encryptedAccessToken = tokenData.access_token;
    let encryptedRefreshToken = tokenData.refresh_token || null;

    if (TOKEN_ENCRYPTION_KEY) {
      encryptedAccessToken = await encryptToken(tokenData.access_token, TOKEN_ENCRYPTION_KEY);
      if (tokenData.refresh_token) {
        encryptedRefreshToken = await encryptToken(tokenData.refresh_token, TOKEN_ENCRYPTION_KEY);
      }
    } else {
      console.warn(`[${requestId}] TOKEN_ENCRYPTION_KEY not set - storing tokens unencrypted`);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: upsertError } = await supabase
      .from("microsoft_integrations")
      .upsert({
        user_id: userId,
        email: userInfo.email,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: expiresAt.toISOString(),
        scopes: tokenData.scope,
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error(`[${requestId}] DB upsert error:`, upsertError);
      return redirectWithError("storage_error", requestId);
    }

    await deleteOAuthState(state);

    // Redirect back to the app
    const redirectUrl = new URL(sanitizeReturnUrl(returnUrl, requestId));
    redirectUrl.searchParams.set("microsoft_connected", "true");
    redirectUrl.searchParams.set("email", userInfo.email);

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl.toString() },
    });
  } catch (err) {
    console.error(`[${requestId}] Unexpected error:`, err);
    return redirectWithError("server_error", requestId);
  }
});
