import { useEffect, useMemo, useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowLeft, ArrowRight, Calendar, Check, Loader2 } from "lucide-react";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";

interface Props {
  onNext: (patch: { choices: OnboardingChoices }) => Promise<void>;
  onBack: () => void;
  initial?: OnboardingChoices;
}

type ProviderKey = "google_calendar" | "microsoft_calendar" | "cal_com";

const PROVIDERS: { key: ProviderKey; label: string; helper: string }[] = [
  { key: "google_calendar", label: "Google Calendar", helper: "Sign in with Google" },
  { key: "microsoft_calendar", label: "Microsoft 365", helper: "Sign in with Microsoft" },
  { key: "cal_com", label: "Cal.com", helper: "Paste your API key" },
];

export const CalendarStep = ({ onNext, onBack }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [busyProvider, setBusyProvider] = useState<ProviderKey | null>(null);

  const { integrations, connectIntegration, isLoading: integrationsLoading } = useIntegrations();
  const { googleIntegration, connectGoogle, isLoading: googleLoading } = useGoogleIntegration();

  // Surface OAuth result toasts and clean URL (without leaving /onboarding)
  useEffect(() => {
    const googleConnected = searchParams.get("googleConnected");
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const errorMessage = searchParams.get("errorMessage");

    if (!googleConnected && !success && !error) return;

    if (googleConnected === "true" || success) {
      toast({
        title: "Calendar connected",
        description: "Your calendar is now linked to Ringster.",
      });
    }
    if (error) {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: errorMessage || "We couldn't connect that calendar. Please try again.",
      });
    }
    navigate("/onboarding", { replace: true });
  }, [searchParams, toast, navigate]);

  const connectedKey: ProviderKey | null = useMemo(() => {
    if (googleIntegration) return "google_calendar";
    const found = integrations.find(
      (i) =>
        ["google_calendar", "microsoft_calendar", "cal_com"].includes(i.integration_type) &&
        i.status === "connected" &&
        i.is_active,
    );
    return (found?.integration_type as ProviderKey) || null;
  }, [integrations, googleIntegration]);

  const handleConnect = async (key: ProviderKey) => {
    const returnUrl = `${window.location.origin}/onboarding`;
    setBusyProvider(key);
    try {
      if (key === "google_calendar") {
        await connectGoogle();
        return; // redirects away
      }
      if (key === "microsoft_calendar") {
        const { data, error } = await supabase.functions.invoke("connect-microsoft", {
          method: "POST",
          body: { returnUrl },
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error("No redirect URL received");
      }
      if (key === "cal_com") {
        await connectIntegration("cal_com", returnUrl);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: err?.message || "Please try again.",
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleContinue = async () => {
    setSaving(true);
    await onNext({ choices: { calendarConnected: !!connectedKey } });
    setSaving(false);
  };

  const handleSkip = async () => {
    setSaving(true);
    await onNext({ choices: { calendarConnected: false } });
    setSaving(false);
  };

  const loading = integrationsLoading || googleLoading;

  return (
    <StepCard
      eyebrow="Step 4 of 5"
      title="Connect your calendar"
      description="Let your agent book real appointments. You can always add this later."
      footer={
        <>
          <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {connectedKey ? (
            <Button onClick={handleContinue} disabled={saving} size="lg">
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSkip} disabled={saving} size="lg" variant="secondary">
              Skip for now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map((p) => {
          const isConnected = connectedKey === p.key;
          const isBusy = busyProvider === p.key;
          const disabled = loading || isBusy || (!!connectedKey && !isConnected);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => !isConnected && handleConnect(p.key)}
              disabled={disabled}
              className={`group rounded-2xl border p-5 text-left transition-all ${
                isConnected
                  ? "border-emerald-400/60 bg-emerald-500/10"
                  : "border-white/10 bg-white/5 hover:border-indigo-400 hover:bg-indigo-500/10"
              } ${disabled && !isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div
                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
                  isConnected
                    ? "bg-emerald-500/30 text-emerald-200"
                    : "bg-white/10 text-white/80 group-hover:bg-indigo-500/30 group-hover:text-white"
                }`}
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isConnected ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Calendar className="h-4 w-4" />
                )}
              </div>
              <p className="text-base font-medium text-white">{p.label}</p>
              <p className="mt-1 text-xs text-white/50">
                {isConnected ? "Connected" : p.helper}
              </p>
            </button>
          );
        })}
      </div>
    </StepCard>
  );
};
