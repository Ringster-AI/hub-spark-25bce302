import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sanitizeReturnUrl } from "../_shared/return-url.ts";

const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/microsoft-callback`;
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// PKCE helpers
function generateCodeVerifier(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] connect-microsoft invoked`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!CLIENT_ID) {
      console.error(`[${requestId}] MICROSOFT_CLIENT_ID is not set`);
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing Microsoft Client ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error(`[${requestId}] Auth error:`, authError);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`[${requestId}] Authenticated user: ${userId}`);

    // Microsoft Graph scopes (offline_access required for refresh tokens)
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Calendars.ReadWrite",
    ];

    let requestedReturnUrl: unknown;
    try {
      const body = await req.json();
      requestedReturnUrl = body?.returnUrl;
    } catch {
      requestedReturnUrl = undefined;
    }
    const returnUrl = sanitizeReturnUrl(requestedReturnUrl, requestId);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const stateValue = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const { error: storeError } = await supabase
      .from("oauth_states")
      .insert({
        state: stateValue,
        code_verifier: codeVerifier,
        return_url: returnUrl,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
      });

    if (storeError) {
      console.error(`[${requestId}] Error storing OAuth state:`, storeError);
      return new Response(
        JSON.stringify({ error: "Failed to store OAuth state" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the "common" tenant to support both work/school and personal accounts
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.append("client_id", CLIENT_ID);
    url.searchParams.append("redirect_uri", REDIRECT_URI);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("response_mode", "query");
    url.searchParams.append("scope", scopes.join(" "));
    url.searchParams.append("state", stateValue);
    url.searchParams.append("code_challenge", codeChallenge);
    url.searchParams.append("code_challenge_method", "S256");
    url.searchParams.append("prompt", "consent");

    console.log(`[${requestId}] Generated Microsoft OAuth URL`);

    return new Response(
      JSON.stringify({ url: url.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[${requestId}] Error:`, err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate OAuth URL",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
