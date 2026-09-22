// Shared allowlist validation for OAuth return URLs.
// Prevents open redirects / token hijacking via attacker-supplied return_url values.

const DEFAULT_APP_URL = "http://localhost:5173";

export function getAppUrl(): string {
  return Deno.env.get("APP_URL") || DEFAULT_APP_URL;
}

export function getDefaultReturnUrl(): string {
  return `${getAppUrl()}/dashboard/settings?tab=integrations`;
}

const ALLOWED_HOSTS = new Set<string>([
  "ringster.ai",
  "www.ringster.ai",
  "dev.ringster.ai",
  "getringster.com",
  "www.getringster.com",
  "localhost",
  "127.0.0.1",
]);

const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Returns a safe return URL. Falls back to the app's default settings page
 * whenever the candidate is missing, malformed, or points off-allowlist.
 */
export function sanitizeReturnUrl(candidate: unknown, reqId?: string): string {
  const fallback = getDefaultReturnUrl();
  if (typeof candidate !== "string" || candidate.trim() === "") return fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate, getAppUrl());
  } catch {
    console.warn(`[${reqId ?? "-"}] Rejected unparsable return URL`);
    return fallback;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.warn(`[${reqId ?? "-"}] Rejected return URL with protocol ${parsed.protocol}`);
    return fallback;
  }

  let appHost = "";
  try {
    appHost = new URL(getAppUrl()).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== appHost && !isAllowedHost(host)) {
    console.warn(`[${reqId ?? "-"}] Rejected off-allowlist return URL host: ${host}`);
    return fallback;
  }

  return parsed.toString();
}
