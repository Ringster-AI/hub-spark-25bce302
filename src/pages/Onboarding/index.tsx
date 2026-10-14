import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useOnboardingProgress, TOTAL_STEPS } from "@/hooks/useOnboardingProgress";
import { StepRail, OnboardingStep } from "@/components/onboarding/StepRail";
import { Seo } from "@/components/seo/Seo";
import { MeetAgentStep } from "./steps/MeetAgentStep";
import { VoiceStep } from "./steps/VoiceStep";
import { PhoneStep } from "./steps/PhoneStep";
import { CalendarStep } from "./steps/CalendarStep";
import { FirstCallStep } from "./steps/FirstCallStep";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";

const STEPS: OnboardingStep[] = [
  { id: 1, title: "Meet your agent", subtitle: "Name & greeting" },
  { id: 2, title: "Voice & tone", subtitle: "How they sound" },
  { id: 3, title: "Phone number", subtitle: "Where calls land" },
  { id: 4, title: "Calendar", subtitle: "Bookings (optional)" },
  { id: 5, title: "First test call", subtitle: "Hear it live" },
];

const Onboarding = () => {
  const { progress, isLoading, isComplete, update } = useOnboardingProgress();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const startedRef = useRef(false);

  useEffect(() => {
    if (progress?.current_step) setStep(progress.current_step);
  }, [progress?.current_step]);

  useEffect(() => {
    if (!progress || startedRef.current) return;
    startedRef.current = true;
    if (!progress.completed_at && (progress.current_step ?? 1) === 1) {
      track("Onboarding_Started");
    }
  }, [progress]);

  const progressPct = useMemo(() => Math.round(((step - 1) / TOTAL_STEPS) * 100), [step]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] text-white/60">
        Loading your onboarding…
      </div>
    );
  }

  if (isComplete) return <Navigate to="/dashboard" replace />;

  const goNext = async (patch?: Parameters<typeof update>[0]) => {
    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    track("Onboarding_Step_Completed", { step });
    await update({ ...(patch || {}), current_step: nextStep, choices: patch?.choices });
    setStep(nextStep);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    track("Onboarding_Step_Completed", { step });
    track("Onboarding_Completed");
    await update({ completed_at: new Date().toISOString(), current_step: TOTAL_STEPS });
    navigate("/dashboard");
  };

  const handleSkip = () => {
    track("Onboarding_Skipped", { step });
    navigate("/dashboard");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Welcome to Ringster — Launch your AI agent"
        description="Set up your AI voice agent in a few guided steps."
      />
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-12 px-6 py-10 lg:grid-cols-[280px_1fr] lg:px-10">
        {/* Left rail */}
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="mb-10 flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Ringster Launchpad
          </div>
          <StepRail steps={STEPS} currentStep={step} />
          <div className="mt-10">
            <div className="mb-2 flex items-center justify-between text-xs text-white/40">
              <span>Setup progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-300 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <button
              onClick={handleSkip}
              className="mt-6 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Skip for now →
            </button>
          </div>
        </aside>

        {/* Right content */}
        <main className="pb-16">
          {import.meta.env.VITE_RINGSTER_DEMO_ENABLED === 'true' && <div className="mb-8 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-5">
            <h2 className="text-lg font-semibold">Hear your receptionist first</h2>
            <p className="my-2 text-sm text-white/70">Try a personalised two-minute role-play before setting up your phone or calendar.</p>
            <Link to="/demo" className="text-indigo-200 underline">Try my receptionist →</Link>
          </div>}
          {step === 1 && <MeetAgentStep onNext={goNext} initial={progress?.choices} />}
          {step === 2 && <VoiceStep onNext={goNext} onBack={goBack} initial={progress?.choices} />}
          {step === 3 && <PhoneStep onNext={goNext} onBack={goBack} initial={progress?.choices} />}
          {step === 4 && <CalendarStep onNext={goNext} onBack={goBack} initial={progress?.choices} />}
          {step === 5 && <FirstCallStep onFinish={finish} onBack={goBack} initial={progress?.choices} />}
        </main>
      </div>
    </div>
  );
};

export default Onboarding;
