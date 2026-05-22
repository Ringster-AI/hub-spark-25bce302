import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingStep = {
  id: number;
  title: string;
  subtitle: string;
};

interface StepRailProps {
  steps: OnboardingStep[];
  currentStep: number;
}

export const StepRail = ({ steps, currentStep }: StepRailProps) => {
  return (
    <ol className="space-y-6">
      {steps.map((step) => {
        const isDone = step.id < currentStep;
        const isActive = step.id === currentStep;
        return (
          <li key={step.id} className="flex items-start gap-4">
            <div
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-all",
                isDone && "border-amber-400/40 bg-amber-400/10 text-amber-300",
                isActive && "border-indigo-400 bg-indigo-500/20 text-indigo-200 shadow-[0_0_0_4px_hsl(243_75%_59%/0.12)]",
                !isDone && !isActive && "border-white/10 bg-white/5 text-white/40"
              )}
            >
              {isDone ? <Check className="h-4 w-4" /> : step.id}
            </div>
            <div className="space-y-0.5">
              <p
                className={cn(
                  "text-sm font-medium tracking-tight transition-colors",
                  isActive ? "text-white" : isDone ? "text-white/70" : "text-white/40"
                )}
              >
                {step.title}
              </p>
              <p className="text-xs text-white/40">{step.subtitle}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
