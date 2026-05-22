import { useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowLeft, ArrowRight, Phone } from "lucide-react";

interface Props {
  onNext: (patch: { choices: OnboardingChoices }) => Promise<void>;
  onBack: () => void;
  initial?: OnboardingChoices;
}

export const PhoneStep = ({ onNext, onBack, initial }: Props) => {
  const [mode, setMode] = useState<"provision" | "forward">("provision");
  const [forwardNumber, setForwardNumber] = useState(initial?.phoneNumber || "");
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    // Actual provisioning happens later via manage-twilio-number when agent is created.
    // We just capture intent + optional forwarding number here.
    await onNext({
      choices: {
        phoneNumber: mode === "forward" ? forwardNumber : undefined,
      },
    });
    setSaving(false);
  };

  return (
    <StepCard
      eyebrow="Step 3 of 5"
      title="Where should calls land?"
      description="Use a dedicated Ringster number, or forward an existing line you already promote."
      footer={
        <>
          <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={saving || (mode === "forward" && !forwardNumber.trim())}
            size="lg"
          >
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("provision")}
          className={`rounded-2xl border p-5 text-left transition-all ${
            mode === "provision"
              ? "border-indigo-400 bg-indigo-500/15"
              : "border-white/10 bg-white/5 hover:border-white/20"
          }`}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/30 text-indigo-200">
            <Phone className="h-4 w-4" />
          </div>
          <p className="text-base font-medium text-white">Get a new Ringster number</p>
          <p className="mt-1 text-xs text-white/50">
            We'll provision a local number for you when you create your agent.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("forward")}
          className={`rounded-2xl border p-5 text-left transition-all ${
            mode === "forward"
              ? "border-indigo-400 bg-indigo-500/15"
              : "border-white/10 bg-white/5 hover:border-white/20"
          }`}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80">
            <Phone className="h-4 w-4" />
          </div>
          <p className="text-base font-medium text-white">Forward my existing line</p>
          <p className="mt-1 text-xs text-white/50">
            Keep your current number — we'll show forwarding instructions later.
          </p>
        </button>
      </div>

      {mode === "forward" && (
        <div className="mt-6 space-y-2">
          <Label className="text-white/80">Your existing phone number</Label>
          <Input
            value={forwardNumber}
            onChange={(e) => setForwardNumber(e.target.value)}
            placeholder="+1 555 000 1234"
            className="border-white/10 bg-white/5 text-white"
          />
        </div>
      )}
    </StepCard>
  );
};
