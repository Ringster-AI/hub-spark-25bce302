import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Headphones, Lock, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useLiveCoachAccess } from "@/hooks/useLiveCoachAccess";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackOnce } from "@/lib/analytics";

const LIVE_COACH_URL = "https://livecoach.ringster.ai/mic-coach.html";
const LIVE_COACH_BACKEND = "https://call-coach-production.up.railway.app";

const LiveCoach = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: access, isLoading: accessLoading } = useLiveCoachAccess();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const { state: sidebarState } = useSidebar();
  const isMobile = useIsMobile();
  const sidebarOffset = isMobile ? 0 : sidebarState === "collapsed" ? 48 : 256; // 3rem / 16rem

  const startSession = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const { data, error } = await supabase.functions.invoke("start-live-coach-session");
      if (error) throw error;
      if (data?.session_token) {
        setSessionToken(data.session_token);
        trackOnce("First_Listen_Live_Used");
      } else if (data?.error === "limit_reached") {
        setStartError("You've reached your monthly session limit.");
      } else {
        throw new Error(data?.error || "Failed to start session");
      }
    } catch (err: any) {
      console.error("Failed to start live coach session:", err);
      setStartError(err.message || "Failed to start session");
      toast({
        title: "Could not start session",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const limitLabel = access?.limit === null ? "Unlimited" : `${access?.sessions_used ?? 0} of ${access?.limit ?? 0}`;
  const isLocked = access && !access.allowed;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-background overflow-hidden"
      style={{ left: sidebarOffset, top: isMobile ? 49 : 0 }}
    >
      {/* Header */}
      <div className="border-b bg-background px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Headphones className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold">Live Call Assist</h1>
              <Badge variant="secondary" className="text-xs">BETA</Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Real-time feedback on your live calls
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{limitLabel}</span>
          {access?.limit !== null && <span> sessions this month</span>}
          <span className="mx-2">·</span>
          <span>{access?.plan_name} plan</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLocked ? (
          <div className="flex items-center justify-center min-h-[60vh] p-4">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <div className="mx-auto bg-muted p-3 rounded-full w-fit mb-3">
                  <Lock className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle>
                  {access?.limit === 0
                    ? "Live Call Assist is a paid feature"
                    : "Monthly session limit reached"}
                </CardTitle>
                <CardDescription>
                  {access?.limit === 0
                    ? "Upgrade to Starter or higher to start coaching live calls."
                    : `You've used ${access?.sessions_used} of ${access?.limit} sessions this month on the ${access?.plan_name} plan. Upgrade for more sessions.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="rounded-lg border p-3 text-sm space-y-1.5 bg-muted/30">
                  <div className="flex justify-between"><span className="text-muted-foreground">Starter</span><span className="font-medium">1 session/mo</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Professional</span><span className="font-medium">5 sessions/mo</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Enterprise</span><span className="font-medium">Unlimited</span></div>
                </div>
                <Button onClick={() => navigate("/dashboard/subscription")} className="w-full">
                  Upgrade plan
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : !sessionToken ? (
          <div className="flex items-center justify-center min-h-[60vh] p-4">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-3">
                  <Headphones className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Ready to start coaching?</CardTitle>
                <CardDescription>
                  Live Call Coach listens to your call on speaker and gives you real-time feedback. Make sure your microphone is enabled when prompted.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {startError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{startError}</span>
                  </div>
                )}
                <Button onClick={startSession} disabled={starting} className="w-full">
                  {starting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Starting...
                    </>
                  ) : (
                    "Start session"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  This will use 1 of your monthly sessions.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <iframe
            src={`${LIVE_COACH_URL}?token=${sessionToken}&backend=${encodeURIComponent(LIVE_COACH_BACKEND)}`}
            allow="microphone; camera; autoplay; clipboard-read; clipboard-write"
            className="block w-full h-full border-0"
            title="Live Call Assist"
          />
        )}
      </div>
    </div>
  );
};

export default LiveCoach;
