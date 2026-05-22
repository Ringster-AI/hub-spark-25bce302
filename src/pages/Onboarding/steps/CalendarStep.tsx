import { useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowLeft, ArrowRight, Calendar } from "lucide-react";

interface Props {
  onNext: (patch: { choices: OnboardingChoices }) => Promise<void>;
  onBack: () => void;
  initial?: OnboardingChoices;
}

const PROVIDERS = [
  { key: "google", label: "Google Calendar", path: "/dashboard/settings?connect=google" },
  { key: "microsoft", label: "Microsoft 365", path: "/dashboard/settings?connect=microsoft" },
  { key: "calcom", label: "Cal.com", path: "/dashboard/settings?connect=calcom" },
];

export const CalendarStep = ({ onNext, onBack, initial }: Props) => {
  const [saving, setSaving] = useState(false);

  const handleSkip = async () => {
    setSaving(true);
    await onNext({ choices: { calendarConnected: false } });
    setSaving(false);
  };

  const handleConnect = (path: string) => {
    // Persist intent and route to settings; user returns to /onboarding to finish.
    window.location.href = path;
  };

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
          <Button onClick={handleSkip} disabled={saving} size="lg" variant="secondary">
            Skip for now <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handleConnect(p.path)}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition-all hover:border-indigo-400 hover:bg-indigo-500/10"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 group-hover:bg-indigo-500/30 group-hover:text-white">
              <Calendar className="h-4 w-4" />
            </div>
            <p className="text-base font-medium text-white">{p.label}</p>
            <p className="mt-1 text-xs text-white/50">Connect to enable booking.</p>
          </button>
        ))}
      </div>
    </StepCard>
  );
};
