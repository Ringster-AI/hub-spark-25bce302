import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sanitizeReturnUrl } from "../_shared/return-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLIENT_ID = Deno.env.get("CALENDLY_CLIENT_ID");
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/calendly-callback`;
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!CLIENT_ID) {
      return new Response(
        JSON.stringify({ error: "CALENDLY_CLIENT_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get return URL (validated against allowlist)
    let requestedReturnUrl: unknown;
    try {
      const body = await req.json();
      requestedReturnUrl = body?.returnUrl;
    } catch {
      requestedReturnUrl = undefined;
    }
    const returnUrl = sanitizeReturnUrl(requestedReturnUrl);

    // Generate state and store it
    const stateValue = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await supabase.from("oauth_states").insert({
      state: stateValue,
      code_verifier: "calendly", // marker to identify this as Calendly flow
      return_url: returnUrl,
      user_id: user.id,
      expires_at: expiresAt.toISOString(),
    });

    // Build Calendly OAuth URL
    const url = new URL("https://auth.calendly.com/oauth/authorize");
    url.searchParams.append("client_id", CLIENT_ID);
    url.searchParams.append("redirect_uri", REDIRECT_URI);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("state", stateValue);

    return new Response(
      JSON.stringify({ url: url.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in connect-calendly:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
