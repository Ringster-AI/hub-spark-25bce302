import { useEffect, useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDUSTRIES, USE_CASES, industryAgentName, industryGreeting } from "@/lib/industryDefaults";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowRight } from "lucide-react";

interface Props {
  onNext: (patch: { choices: OnboardingChoices }) => Promise<void>;
  initial?: OnboardingChoices;
}

export const MeetAgentStep = ({ onNext, initial }: Props) => {
  const [industry, setIndustry] = useState(initial?.industry || "");
  const [useCase, setUseCase] = useState(initial?.useCase || "inbound");
  const [agentName, setAgentName] = useState(initial?.agentName || "");
  const [greeting, setGreeting] = useState(initial?.greeting || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (industry && !initial?.agentName) setAgentName(industryAgentName(industry));
    if (industry && !initial?.greeting) setGreeting(industryGreeting(industry));
  }, [industry]);

  const canContinue = !!industry && !!agentName.trim() && !!greeting.trim();

  const handleNext = async () => {
    setSaving(true);
    await onNext({ choices: { industry, useCase: useCase as any, agentName, greeting } });
    setSaving(false);
  };

  return (
    <StepCard
      eyebrow="Step 1 of 5"
      title="Meet your AI agent"
      description="We'll tailor a name and greeting to your business. You can refine everything later."
      footer={
        <div className="ml-auto">
          <Button onClick={handleNext} disabled={!canContinue || saving} size="lg">
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-white/80">What industry are you in?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INDUSTRIES.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setIndustry(i.key)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-all ${
                  industry === i.key
                    ? "border-indigo-400 bg-indigo-500/15 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white/80">Primary use case</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {USE_CASES.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => setUseCase(u.key)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-all ${
                  useCase === u.key
                    ? "border-indigo-400 bg-indigo-500/15 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            <Label className="text-white/80">Agent name</Label>
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="border-white/10 bg-white/5 text-white"
              placeholder="Sarah"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Opening greeting</Label>
            <Textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="min-h-[88px] border-white/10 bg-white/5 text-white"
              placeholder="Hi, this is Sarah from..."
            />
          </div>
        </div>
      </div>
    </StepCard>
  );
};
