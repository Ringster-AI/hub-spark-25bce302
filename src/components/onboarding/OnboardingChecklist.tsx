import { Link } from "react-router-dom";
import { useOnboardingProgress, TOTAL_STEPS } from "@/hooks/useOnboardingProgress";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEP_LABELS = [
  "Meet your agent",
  "Choose voice & tone",
  "Set up your phone number",
  "Connect a calendar",
  "Make your first test call",
];

export const OnboardingChecklist = () => {
  const { progress, isComplete, isLoading } = useOnboardingProgress();
  if (isLoading || isComplete || !progress) return null;

  const current = progress.current_step ?? 1;
  const completed = Math.max(0, current - 1);
  const pct = Math.round((completed / TOTAL_STEPS) * 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 via-background to-background p-6 md:p-8">
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-300/80">
              Launchpad · {completed} of {TOTAL_STEPS} done
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Finish setting up your AI agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A few steps left to get your first call answered.
            </p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link to="/onboarding">
            Continue setup <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="relative mt-6">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-300 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="relative mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {STEP_LABELS.map((label, idx) => {
          const step = idx + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                done
                  ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
                  : active
                  ? "border-indigo-400/40 bg-indigo-500/10 text-foreground"
                  : "border-border/40 bg-card/30 text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done ? "bg-amber-400/20 text-amber-300" : active ? "bg-indigo-500/30 text-indigo-200" : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : step}
              </span>
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
