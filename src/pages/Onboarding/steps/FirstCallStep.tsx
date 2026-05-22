import { useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowLeft, PartyPopper, PhoneCall } from "lucide-react";

interface Props {
  onFinish: () => Promise<void>;
  onBack: () => void;
  initial?: OnboardingChoices;
}

export const FirstCallStep = ({ onFinish, onBack, initial }: Props) => {
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    await onFinish();
  };

  const agentName = initial?.agentName || "your agent";

  return (
    <StepCard
      eyebrow="Step 5 of 5"
      title="Hear your agent live"
      description={`Make a test call to ${agentName} — it's the fastest way to feel what Ringster does.`}
      footer={
        <>
          <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleFinish} disabled={saving} size="lg">
            <PartyPopper className="mr-2 h-4 w-4" /> Finish setup
          </Button>
        </>
      }
    >
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-amber-300/5 p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
          <PhoneCall className="h-6 w-6" />
        </div>
        <p className="text-xl font-medium text-white">Ready when you are</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Your agent will be provisioned and connected the moment you finish.
          From the dashboard, you can start a test call or share your number.
        </p>
      </div>
    </StepCard>
  );
};
