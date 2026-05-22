import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, PhoneCall, Calendar, Users, Share2, Check } from "lucide-react";
import { useFirstCallCelebration } from "@/hooks/useFirstCallCelebration";
import { useIntegrations } from "@/hooks/useIntegrations";
import { toast } from "sonner";

// Lightweight indigo + gold confetti — no extra dependency
const ConfettiBurst = () => {
  const pieces = Array.from({ length: 60 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.8;
        const duration = 2.4 + Math.random() * 1.4;
        const size = 4 + Math.random() * 6;
        const isGold = i % 9 === 0; // single gold burst sprinkled in
        const color = isGold ? "#f0d78c" : i % 2 === 0 ? "#4f46e5" : "#818cf8";
        const rotate = Math.random() * 360;
        return (
          <span
            key={i}
            className="absolute top-[-20px] block rounded-sm opacity-90"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 0.4,
              background: color,
              transform: `rotate(${rotate}deg)`,
              animation: `ringster-confetti ${duration}s ${delay}s cubic-bezier(.22,.61,.36,1) forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes ringster-confetti {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(680px) rotate(720deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ringster-confetti { 0%,100% { opacity: 0; transform: none; } }
        }
      `}</style>
    </div>
  );
};

export const FirstCallCelebration = () => {
  const { shouldCelebrate, call, acknowledge } = useFirstCallCelebration();
  const { integrations } = useIntegrations();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldCelebrate) setOpen(true);
  }, [shouldCelebrate]);

  if (!shouldCelebrate || !call) return null;

  const hasCalendar = (integrations || []).some(
    (i: any) => i.integration_type === "calendar" && i.status === "connected"
  );

  const nextAction = !hasCalendar
    ? {
        icon: Calendar,
        label: "Connect a calendar",
        description: "Let your agent book appointments automatically.",
        to: "/dashboard/calendar",
      }
    : {
        icon: Users,
        label: "Invite a teammate",
        description: "Share access so the whole team can listen in.",
        to: "/dashboard/team",
      };

  const handleClose = async () => {
    setOpen(false);
    await acknowledge();
  };

  const handleShare = async () => {
    const summary = `My AI receptionist just answered its first call on Ringster. ${
      call.duration ? `Lasted ${call.duration}s.` : ""
    }`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Ringster — first call", text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        toast.success("Summary copied to clipboard");
      }
    } catch {
      /* user dismissed */
    }
  };

  const NextIcon = nextAction.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="relative max-w-xl overflow-hidden border-indigo-500/30 bg-[#0a0a1a] p-0 text-white">
        <ConfettiBurst />
        <div className="relative z-10 px-8 pt-10 pb-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-amber-300/20 ring-1 ring-indigo-400/40">
            <Sparkles className="h-6 w-6 text-amber-300" />
          </div>
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Your agent just took its first call
          </h2>
          <p className="mt-2 text-center text-sm text-white/60">
            This is the moment your business stops missing calls.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
                <PhoneCall className="h-4 w-4 text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  Call from {call.fromNumber || "Unknown number"}
                </p>
                <p className="text-xs text-white/50">
                  {call.duration ? `${call.duration}s` : "Just now"}
                  {call.startTime
                    ? ` · ${new Date(call.startTime).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-medium text-emerald-300">
                <Check className="h-3 w-3" /> Answered
              </span>
            </div>
            {call.recordingUrl && (
              <audio
                controls
                src={call.recordingUrl}
                className="mt-3 w-full"
                preload="none"
              />
            )}
          </div>

          <Link
            to={nextAction.to}
            onClick={handleClose}
            className="mt-6 flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4 transition-colors hover:bg-indigo-500/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
              <NextIcon className="h-4 w-4 text-indigo-300" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{nextAction.label}</p>
              <p className="text-xs text-white/50">{nextAction.description}</p>
            </div>
          </Link>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              onClick={handleShare}
              className="text-white/70 hover:text-white"
            >
              <Share2 className="mr-2 h-4 w-4" /> Share this moment
            </Button>
            <Button
              onClick={handleClose}
              className="bg-gradient-to-r from-indigo-500 to-indigo-400 text-white hover:from-indigo-400 hover:to-indigo-300"
            >
              Continue to dashboard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
