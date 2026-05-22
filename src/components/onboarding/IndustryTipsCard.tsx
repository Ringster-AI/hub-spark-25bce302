import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { industryTemplate } from "@/lib/industryDefaults";
import { Lightbulb } from "lucide-react";

export const IndustryTipsCard = () => {
  const { progress, isComplete, isLoading } = useOnboardingProgress();
  if (isLoading || isComplete || !progress) return null;

  const industry = progress.choices?.industry;
  if (!industry) return null;

  const tpl = industryTemplate(industry);

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/5 via-background to-background p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300/80">
            Tailored for your industry
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">Quick wins to set up next</h3>
          <ul className="mt-4 space-y-2">
            {tpl.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
