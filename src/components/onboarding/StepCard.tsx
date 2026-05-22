import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export const StepCard = ({ eyebrow, title, description, children, footer, className }: StepCardProps) => {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl shadow-[0_20px_60px_-30px_rgba(79,70,229,0.5)]",
        className
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-indigo-300/80">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-white">{title}</h2>
      {description && <p className="mt-3 text-base text-white/60">{description}</p>}
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-10 flex items-center justify-between gap-3 border-t border-white/5 pt-6">{footer}</div>}
    </div>
  );
};
