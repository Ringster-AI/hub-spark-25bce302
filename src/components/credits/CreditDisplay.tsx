import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { CreditsService } from "@/services/creditsService";
import { CreditStatus } from "@/types/credits";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreditDisplayProps {
  onUpgrade?: () => void;
  onTopUp?: () => void;
  compact?: boolean;
}

export const CreditDisplay = ({ onUpgrade, onTopUp, compact = false }: CreditDisplayProps) => {
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof import("@/integrations/supabase/client").supabase.channel> | null = null;

    const fetchCredits = async () => {
      try {
        const status = await CreditsService.getCreditStatus();
        if (!cancelled) setCreditStatus(status);
      } catch (error) {
        console.error('Error fetching credit status:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handleRefresh = () => fetchCredits();
    window.addEventListener("credits:refresh", handleRefresh);

    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      await fetchCredits();
      if (cancelled || !user) return;

      // Realtime subscription replaces the previous 30s polling.
      channel = supabase
        .channel(`credit_display:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_credits",
            filter: `user_id=eq.${user.id}`,
          },
          () => fetchCredits()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("credits:refresh", handleRefresh);
      if (channel) {
        import("@/integrations/supabase/client").then(({ supabase }) =>
          supabase.removeChannel(channel!)
        );
      }
    };
  }, []);

  if (loading) {
    return (
      <Card className={compact ? "w-full" : ""}>
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
            <div className="h-2 bg-muted rounded w-full mb-2"></div>
            <div className="h-8 bg-muted rounded w-1/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!creditStatus) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Unable to load credit information. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const {
    remainingCredits,
    totalCredits,
    usagePercentage,
    resetDate,
    isLowCredits,
    isOutOfCredits,
    planRemaining,
    planCredits,
    addOnRemaining,
    addOnCredits,
    hasUnusedAddOn,
  } = creditStatus;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CreditCard className="h-4 w-4" />
        <span>{remainingCredits} / {totalCredits} credits</span>
        {isLowCredits && (
          <Badge variant="destructive" className="text-xs">
            Low
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Credits Remaining
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-2xl font-bold">
                {remainingCredits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                of {totalCredits.toLocaleString()}
              </span>
            </div>
            <Progress value={100 - usagePercentage} className="h-2" />
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-muted-foreground">
                {usagePercentage}% used this month
              </span>
              <span className="text-xs text-muted-foreground">
                Plan resets {new Date(resetDate).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              1 credit = 1 minute of talk time
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">Plan minutes</div>
              <div className="font-semibold">
                {planRemaining.toLocaleString()} / {planCredits.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">Resets monthly</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">Add-on minutes</div>
              <div className="font-semibold">
                {addOnRemaining.toLocaleString()} / {addOnCredits.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">Never expire</div>
            </div>
          </div>

          {isOutOfCredits && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You've exhausted your credits. Outbound calls are blocked until you upgrade or purchase more credits.
              </AlertDescription>
            </Alert>
          )}

          {isLowCredits && !isOutOfCredits && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                You're running low on credits. Consider upgrading or purchasing more to avoid interruptions.
              </AlertDescription>
            </Alert>
          )}

          {hasUnusedAddOn && onTopUp && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You still have unused add-on minutes. Use them up before purchasing another add-on pack.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            {onTopUp && (
              <Button
                variant="outline"
                onClick={onTopUp}
                className="flex-1"
                disabled={hasUnusedAddOn}
              >
                Buy 500 Credits - $149
              </Button>
            )}
            {onUpgrade && (
              <Button onClick={onUpgrade} className="flex-1">
                Upgrade Plan
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};