// Lightweight analytics helper. Only fires when the user granted analytics
// consent (gated via useCookieConsent). Falls back to a no-op otherwise.

type EventName =
  | "Onboarding_Started"
  | "Onboarding_Step_Completed"
  | "Onboarding_Completed"
  | "Onboarding_Skipped"
  | "First_Call_Received"
  | "First_Call_Acknowledged";

const CONSENT_KEY = "ringster_cookie_consent";

const hasAnalyticsConsent = (): boolean => {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { analytics?: boolean };
    return !!parsed.analytics;
  } catch {
    return false;
  }
};

export const track = (event: EventName, props?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...props });
  } catch {
    /* swallow */
  }
};
