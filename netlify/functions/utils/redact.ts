/**
 * Lightweight log redaction for outbound serverless logs.
 * Drops bodies and replaces phone numbers/emails with masked summaries
 * so logs are useful for debugging without leaking PII.
 */

const PHONE_RE = /\+?\d[\d\s\-().]{6,}\d/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

function maskEmail(e: string): string {
  const [user, domain] = e.split("@");
  const head = user.slice(0, 1);
  return `${head}***@${domain ?? "***"}`;
}

function redactString(s: string): string {
  return s.replace(PHONE_RE, (m) => maskPhone(m)).replace(EMAIL_RE, (m) => maskEmail(m));
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "twilio_auth_token",
  "twilioauthtoken",
  "twilioaccountsid",
  "twilio_account_sid",
]);


export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else if (typeof v === "string" && (k.toLowerCase().includes("phone") || k.toLowerCase().includes("number"))) {
        out[k] = maskPhone(v);
      } else if (typeof v === "string" && k.toLowerCase().includes("email")) {
        out[k] = maskEmail(v);
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Convenience: summarise a payload object for a log line. */
export function summarizeForLog(payload: unknown): string {
  try {
    return JSON.stringify(redact(payload));
  } catch {
    return "[unserialisable payload]";
  }
}
