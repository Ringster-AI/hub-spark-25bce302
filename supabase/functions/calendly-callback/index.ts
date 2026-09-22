import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encryptToken, decryptToken } from "../_shared/crypto.ts";
import { sanitizeReturnUrl } from "../_shared/return-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLIENT_ID = Deno.env.get("CALENDLY_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("CALENDLY_CLIENT_SECRET") || "";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/calendly-callback`;
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Handle POST actions (test, refresh)
  if (req.method === "POST") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Authentication failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();

      if (body.action === "test" && body.integrationId) {
        const accessToken = await getCalendlyToken(supabase, body.integrationId, user.id);
        const testRes = await fetch("https://api.calendly.com/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const testBody = await testRes.text();
        if (!testRes.ok) {
          return new Response(
            JSON.stringify({ error: `Calendly test failed: ${testBody}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body.action === "refresh" && body.integrationId) {
        await refreshCalendlyToken(supabase, body.integrationId, user.id);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Handle GET: OAuth callback
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return redirectWithError(`Calendly authorization denied: ${error}`);
    }

    if (!code || !state) {
      return redirectWithError("Missing code or state parameter");
    }

    // Look up state
    const { data: stateData, error: stateError } = await supabase
      .from("oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !stateData) {
      return redirectWithError("Invalid or expired state");
    }

    // Delete state
    await supabase.from("oauth_states").delete().eq("state", state);

    // Check expiry
    if (new Date(stateData.expires_at) < new Date()) {
      return redirectWithError("OAuth state expired");
    }

    const userId = stateData.user_id;
    const returnUrl = sanitizeReturnUrl(stateData.return_url);

    // Exchange code for tokens
    const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Calendly token exchange failed:", errText);
      return redirectWithError("Failed to exchange authorization code");
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userBody = await userRes.json();
    const calendlyUser = userBody.resource || {};
    const displayName = calendlyUser.name || calendlyUser.email || "Calendly User";
    const userUri = calendlyUser.uri || "";

    // Encrypt credentials
    let credentials: Record<string, any> = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
    if (TOKEN_ENCRYPTION_KEY) {
      const encrypted = await encryptToken(JSON.stringify(credentials), TOKEN_ENCRYPTION_KEY);
      credentials = { encrypted };
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString();

    // Upsert integration
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("integration_type", "calendly")
      .single();

    if (existing) {
      await supabase
        .from("integrations")
        .update({
          credentials,
          status: "connected",
          is_active: true,
          display_name: `Calendly (${displayName})`,
          metadata: { user_uri: userUri, name: displayName },
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        user_id: userId,
        integration_type: "calendly",
        provider_name: "calendly",
        display_name: `Calendly (${displayName})`,
        status: "connected",
        credentials,
        configuration: {},
        metadata: { user_uri: userUri, name: displayName },
        capabilities: ["calendar", "scheduling"],
        is_active: true,
        expires_at: expiresAt,
      });
    }

    // Redirect back
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set("calendly_connected", "true");
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (err: any) {
    console.error("Error in calendly-callback:", err);
    return redirectWithError(err.message);
  }
});

function redirectWithError(message: string) {
  const url = new URL(`${APP_URL}/dashboard/settings`);
  url.searchParams.set("tab", "integrations");
  url.searchParams.set("error", message);
  return Response.redirect(url.toString(), 302);
}

async function getCalendlyToken(supabase: any, integrationId: string, userId: string): Promise<string> {
  const { data: integration } = await supabase
    .from("integrations")
    .select("credentials, expires_at")
    .eq("id", integrationId)
    .eq("user_id", userId)
    .single();

  if (!integration) throw new Error("Integration not found");

  const creds = integration.credentials as Record<string, any>;
  let accessToken: string;
  let refreshToken: string;

  if (creds.encrypted && TOKEN_ENCRYPTION_KEY) {
    const decrypted = JSON.parse(await decryptToken(creds.encrypted, TOKEN_ENCRYPTION_KEY));
    accessToken = decrypted.access_token;
    refreshToken = decrypted.refresh_token;
  } else {
    accessToken = creds.access_token;
    refreshToken = creds.refresh_token;
  }

  // Check if token expired
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    return await refreshCalendlyToken(supabase, integrationId, userId);
  }

  return accessToken;
}

async function refreshCalendlyToken(supabase: any, integrationId: string, userId: string): Promise<string> {
  const { data: integration } = await supabase
    .from("integrations")
    .select("credentials")
    .eq("id", integrationId)
    .eq("user_id", userId)
    .single();

  if (!integration) throw new Error("Integration not found");

  const creds = integration.credentials as Record<string, any>;
  let refreshToken: string;

  if (creds.encrypted && TOKEN_ENCRYPTION_KEY) {
    const decrypted = JSON.parse(await decryptToken(creds.encrypted, TOKEN_ENCRYPTION_KEY));
    refreshToken = decrypted.refresh_token;
  } else {
    refreshToken = creds.refresh_token;
  }

  const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Calendly token refresh failed: ${errText}`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString();

  let newCredentials: Record<string, any> = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
  };
  if (TOKEN_ENCRYPTION_KEY) {
    const encrypted = await encryptToken(JSON.stringify(newCredentials), TOKEN_ENCRYPTION_KEY);
    newCredentials = { encrypted };
  }

  await supabase
    .from("integrations")
    .update({
      credentials: newCredentials,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);

  return tokens.access_token;
}
