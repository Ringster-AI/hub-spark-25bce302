

import { corsHeaders } from "./cors.ts";
import { sanitizeReturnUrl } from "./return-url.ts";

const DEFAULT_APP_URL = "http://localhost:5173";

/**
 * Redirect with error information
 */
export function redirectWithError(
  errorCode: string, 
  reqId: string, 
  appUrl = Deno.env.get("APP_URL") || DEFAULT_APP_URL
) {
  const errorMessages: Record<string, string> = {
    "server_config_error": "Server configuration error",
    "no_code": "No authorization code received",
    "invalid_state": "Invalid state parameter",
    "expired_state": "Authorization request expired",
    "invalid_response": "Invalid response from Google",
    "token_error": "Error exchanging code for tokens",
    "token_exchange_error": "Error during token exchange with Google",
    "userinfo_error": "Error retrieving user information",
    "userinfo_parse_error": "Error parsing user information",
    "userinfo_request_error": "Error requesting user information",
    "request_timeout": "Request timed out",
    "storage_error": "Error storing integration data",
    "storage_parse_error": "Error parsing storage response",
    "missing_user_id": "Missing user ID for token storage",
    "database_error": "Database query error",
    "auth_error": "Authentication error",
    "access_denied": "Access denied by user",
    "server_error": "Unexpected server error"
  };
  
  const errorMessage = errorMessages[errorCode] || "Unknown error";
  console.error(`[${reqId}] Error: ${errorCode} - ${errorMessage}`);
  
  const errorUrl = new URL(`${appUrl}/dashboard/settings`);
  errorUrl.searchParams.append("tab", "integrations");
  errorUrl.searchParams.append("error", errorCode);
  errorUrl.searchParams.append("errorMessage", errorMessage);
  // Add timestamp as cache-buster
  errorUrl.searchParams.append("ts", Date.now().toString());
  console.log(`[${reqId}] Redirecting with error: ${errorCode} to ${errorUrl.toString()}`);
  
  return new Response(null, {
    status: 302, // Explicitly set 302 Found status code
    headers: {
      Location: errorUrl.toString(),
      "Access-Control-Allow-Origin": appUrl,
      "Access-Control-Allow-Credentials": "true",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

/**
 * Create a successful redirect response
 */
export function createSuccessRedirect(
  returnUrl: string, 
  userInfo: { email: string }, 
  tokenData: { scope: string },
  reqId: string
) {
  const redirectUrl = new URL(returnUrl);
  redirectUrl.searchParams.append("success", "true");
  redirectUrl.searchParams.append("email", userInfo.email);
  redirectUrl.searchParams.append("googleConnected", "true");
  redirectUrl.searchParams.append("googleScopes", tokenData.scope);
  
  // Add timestamp as cache-buster
  redirectUrl.searchParams.append("ts", Date.now().toString());
  
  const redirectString = redirectUrl.toString();
  console.log(`[${reqId}] Redirecting to: ${redirectString.substring(0, 100)}...`);
  
  return new Response(null, {
    status: 302, // Explicitly set 302 Found status code
    headers: {
      Location: redirectString,
      "Access-Control-Allow-Origin": Deno.env.get("APP_URL") || DEFAULT_APP_URL,
      "Access-Control-Allow-Credentials": "true",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

