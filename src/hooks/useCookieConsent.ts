import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import posthog from "posthog-js";

export interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

const CONSENT_KEY = "ringster_cookie_consent";
const CONSENT_TIMESTAMP_KEY = "ringster_cookie_consent_timestamp";
const SESSION_ID_KEY = "ringster_session_id";
const CONSENT_EXPIRY_DAYS = 365;

// Generate a unique session ID
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get or create session ID
const getSessionId = (): string => {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
};

export const useCookieConsent = () => {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  // Load consent from localStorage on mount
  useEffect(() => {
    const storedConsent = localStorage.getItem(CONSENT_KEY);
    const storedTimestamp = localStorage.getItem(CONSENT_TIMESTAMP_KEY);

    if (storedConsent && storedTimestamp) {
      const timestamp = parseInt(storedTimestamp, 10);
      const expiryDate = new Date(timestamp);
      expiryDate.setDate(expiryDate.getDate() + CONSENT_EXPIRY_DAYS);

      if (new Date() < expiryDate) {
        const parsed = JSON.parse(storedConsent) as CookiePreferences;
        setPreferences(parsed);
        setShowBanner(false);
      } else {
        // Consent expired, show banner again
        setShowBanner(true);
      }
    } else {
      // No consent stored, show banner
      setShowBanner(true);
    }
    setIsLoaded(true);
  }, []);

  // Load/block scripts based on preferences
  useEffect(() => {
    if (!preferences || !isLoaded) return;

    // Analytics scripts (Google Analytics, GTM)
    if (preferences.analytics) {
      loadAnalyticsScripts();
    } else if ((window as any).__posthog_initialized) {
      try { posthog.opt_out_capturing(); } catch { /* posthog not ready — ignore */ }
    }

    // Marketing scripts (Meta Pixel)
    if (preferences.marketing) {
      loadMarketingScripts();
    }
  }, [preferences, isLoaded]);

  const loadAnalyticsScripts = () => {
    // Google Tag Manager
    if (!document.getElementById("gtm-script")) {
      const gtmScript = document.createElement("script");
      gtmScript.id = "gtm-script";
      gtmScript.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-P5M6SM65');`;
      document.head.appendChild(gtmScript);
    }

    // Google Analytics
    if (!document.getElementById("ga-script")) {
      const gaScript = document.createElement("script");
      gaScript.id = "ga-script";
      gaScript.async = true;
      gaScript.src = "https://www.googletagmanager.com/gtag/js?id=G-YB77QZJ6T9";
      document.head.appendChild(gaScript);

      const gaConfig = document.createElement("script");
      gaConfig.id = "ga-config";
      gaConfig.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-YB77QZJ6T9');
      `;
      document.head.appendChild(gaConfig);
    }

    // PostHog (product analytics, session recordings, feature flags)
    const phToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
    const phHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
    if (phToken && !(window as any).__posthog_initialized) {
      posthog.init(phToken, {
        api_host: phHost,
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        session_recording: { maskAllInputs: true },
        autocapture: true,
      });
      (window as any).__posthog_initialized = true;
    } else if (phToken && (window as any).__posthog_initialized) {
      posthog.opt_in_capturing();
    }
  };

  const loadMarketingScripts = () => {
    // Apollo.io Website Tracker
    if (!document.getElementById("apollo-script")) {
      const apolloScript = document.createElement("script");
      apolloScript.id = "apollo-script";
      apolloScript.innerHTML = `(function(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n;o.async=true;o.defer=true;o.onload=function(){if(window.trackingFunctions){window.trackingFunctions.onLoad({appId:"69acd209a859500011e96498"})}};document.head.appendChild(o)})();`;
      document.head.appendChild(apolloScript);
    }

    // Meta/Facebook Pixel
    if (!document.getElementById("fb-pixel-script")) {
      const fbScript = document.createElement("script");
      fbScript.id = "fb-pixel-script";
      fbScript.innerHTML = `
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '986847029497948');
        fbq('track', 'PageView');
      `;
      document.head.appendChild(fbScript);
    }
  };

  const saveConsent = useCallback(async (newPreferences: CookiePreferences) => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(newPreferences));
    localStorage.setItem(CONSENT_TIMESTAMP_KEY, Date.now().toString());
    setPreferences(newPreferences);
    setShowBanner(false);

    // Log consent to database
    try {
      await supabase.from("cookie_consent_logs").insert({
        session_id: getSessionId(),
        essential: newPreferences.essential,
        analytics: newPreferences.analytics,
        marketing: newPreferences.marketing,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error("Failed to log cookie consent:", error);
    }
  }, []);

  const acceptAll = useCallback(() => {
    saveConsent({ essential: true, analytics: true, marketing: true });
  }, [saveConsent]);

  const rejectNonEssential = useCallback(() => {
    saveConsent({ essential: true, analytics: false, marketing: false });
  }, [saveConsent]);

  const openPreferences = useCallback(() => {
    setShowBanner(false);
  }, []);

  const resetConsent = useCallback(() => {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_TIMESTAMP_KEY);
    setPreferences(null);
    setShowBanner(true);
  }, []);

  return {
    preferences,
    isLoaded,
    showBanner,
    setShowBanner,
    acceptAll,
    rejectNonEssential,
    saveConsent,
    openPreferences,
    resetConsent,
  };
};
