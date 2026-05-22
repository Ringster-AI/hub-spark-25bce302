import { useState } from "react";
import { StepCard } from "@/components/onboarding/StepCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { OnboardingChoices } from "@/hooks/useOnboardingProgress";
import { ArrowLeft, ArrowRight, Volume2 } from "lucide-react";

interface Props {
  onNext: (patch: { choices: OnboardingChoices }) => Promise<void>;
  onBack: () => void;
  initial?: OnboardingChoices;
}

const VOICES = [
  { key: "warm", name: "Warm", desc: "Friendly, conversational, reassuring." },
  { key: "professional", name: "Professional", desc: "Clear, composed, trustworthy." },
  { key: "friendly", name: "Friendly", desc: "Bright, upbeat, approachable." },
] as const;

export const VoiceStep = ({ onNext, onBack, initial }: Props) => {
  const [voice, setVoice] = useState<OnboardingChoices["voice"]>(initial?.voice || "warm");
  const [tone, setTone] = useState<number>(initial?.tone ?? 50);
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    await onNext({ choices: { voice, tone } });
    setSaving(false);
  };

  return (
    <StepCard
      eyebrow="Step 2 of 5"
      title="Choose a voice & tone"
      description="Pick how your agent should sound. You can fine-tune voices anytime in Agent settings."
      footer={
        <>
          <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleNext} disabled={saving} size="lg">
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {VOICES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVoice(v.key)}
              className={`group rounded-2xl border p-5 text-left transition-all ${
                voice === v.key
                  ? "border-indigo-400 bg-indigo-500/15 shadow-[0_0_0_4px_hsl(243_75%_59%/0.12)]"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 group-hover:bg-indigo-500/30">
                <Volume2 className="h-4 w-4" />
              </div>
              <p className="text-base font-medium text-white">{v.name}</p>
              <p className="mt-1 text-xs text-white/50">{v.desc}</p>
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <Label className="text-white/80">Tone</Label>
            <span className="text-xs text-white/40">
              {tone < 33 ? "Formal" : tone < 66 ? "Balanced" : "Casual"}
            </span>
          </div>
          <Slider value={[tone]} onValueChange={(v) => setTone(v[0])} max={100} step={1} />
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/30">
            <span>Formal</span>
            <span>Casual</span>
          </div>
        </div>
      </div>
    </StepCard>
  );
};
