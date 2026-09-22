
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sanitizeReturnUrl } from "../_shared/return-url.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/google-callback`;
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Generate a random string for PKCE code verifier
function generateCodeVerifier(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Generate code challenge from verifier
async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Base64url encode the digest
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

serve(async (req) => {
  console.log("Request received to connect-google");
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting OAuth flow initiation`);
  
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    console.log(`[${requestId}] Handling OPTIONS request`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environmental variables
    if (!CLIENT_ID) {
      console.error(`[${requestId}] GOOGLE_CLIENT_ID environment variable is not set`);
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing Google Client ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the authenticated user from the request
    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        console.error(`[${requestId}] No Authorization header found`);
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Extract JWT token
      const token = authHeader.replace('Bearer ', '');
      
      // Get user from Supabase auth
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
          console.error(`[${requestId}] Error getting user from token:`, error);
          return new Response(
            JSON.stringify({ error: "Authentication failed", details: error?.message }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[${requestId}] Authenticated user: ${user.id}`);
      }
    } catch (authError) {
      console.error(`[${requestId}] Error authenticating user:`, authError);
      return new Response(
        JSON.stringify({ error: "Authentication error", details: String(authError) }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request only the minimum scopes required and aligned with Google Cloud
    // Console verification (Limited Use compliant).
    const scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar.events.owned",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ];

    // Get the return URL from the request if provided (validated against allowlist)
    let requestedReturnUrl: unknown;
    try {
      const requestData = await req.json();
      requestedReturnUrl = requestData?.returnUrl;
    } catch (e) {
      requestedReturnUrl = undefined;
    }
    const returnUrl = sanitizeReturnUrl(requestedReturnUrl, requestId);

    console.log(`[${requestId}] Using return URL: ${returnUrl}`);
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    console.log(`[${requestId}] Generated PKCE code_challenge`);
    
    // Generate random state
    const stateValue = crypto.randomUUID();
    
    // Store PKCE and state in Supabase for later verification
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      try {
        // Get user from request if authenticated
        let userId = null;
        const authHeader = req.headers.get("Authorization");
        
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            userId = user.id;
            console.log(`[${requestId}] Authenticated user: ${userId}`);
          }
        }
        
        // Store oauth state with 10 minute expiry
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);
        
        const { data, error: storeError } = await supabase
          .from('oauth_states')
          .insert({
            state: stateValue,
            code_verifier: codeVerifier,
            return_url: returnUrl,
            user_id: userId,
            expires_at: expiresAt.toISOString()
          })
          .select('*');
          
        if (storeError) {
          console.error(`[${requestId}] Error storing OAuth state:`, storeError);
          throw new Error('Failed to store OAuth state');
        }
        
        console.log(`[${requestId}] Stored OAuth state in database:`, data);
      } catch (dbErr) {
        console.error(`[${requestId}] Database error:`, dbErr);
        // Continue with the flow, but log the error
      }
    } else {
      console.warn(`[${requestId}] No Supabase credentials available, skipping state storage`);
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.append("client_id", CLIENT_ID);
    url.searchParams.append("redirect_uri", REDIRECT_URI);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("scope", scopes.join(" "));
    url.searchParams.append("access_type", "offline");
    url.searchParams.append("prompt", "consent");
    
    // Add PKCE code challenge
    url.searchParams.append("code_challenge", codeChallenge);
    url.searchParams.append("code_challenge_method", "S256");
    
    // Add state parameter
    url.searchParams.append("state", stateValue);

    console.log(`[${requestId}] Generated OAuth URL with PKCE and state`);

    return new Response(
      JSON.stringify({ url: url.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[${requestId}] Error generating OAuth URL:`, err);
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate OAuth URL", 
        details: err instanceof Error ? err.message : String(err) 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
