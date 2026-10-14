
import { useSubscriptionFeatures } from "@/hooks/useSubscriptionFeatures";
import { useBillingData } from "./hooks/useBillingData";
import { SubscriptionHeader } from "./SubscriptionHeader";
import { CurrentPlanUsage } from "./CurrentPlanUsage";
import { AgentUsageTable } from "./AgentUsageTable";
import { MonthlySummary } from "./MonthlySummary";
import { PricingPlans } from "@/components/subscription/PricingPlans";
import { CreditDisplay } from "@/components/credits/CreditDisplay";
import { CreditTransactionHistory } from "@/components/credits/CreditTransactionHistory";
import { supabase } from "@/integrations/supabase/client";
import { ReferralCodeInput } from "@/components/partner/ReferralTracker";
import { useToast } from "@/hooks/use-toast";

export const SubscriptionContent = () => {
  const { features, isLoading } = useSubscriptionFeatures();
  const { billingData, isLoadingBilling } = useBillingData();
  const { toast } = useToast();

  const usagePercentage = features.limits.minutesAllowance > 0 ? 
    Math.round(((features.limits.minutesAllowance - features.limits.remainingMinutes) / features.limits.minutesAllowance) * 100) : 0;

  const handleTopUp = async () => {
    try {
      const { data: addonPlan, error: planError } = await supabase
        .from("subscription_plans")
        .select("stripe_price_id")
        .eq("billing_interval", "one_time")
        .eq("is_active", true)
        .order("price", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (planError) throw planError;
      if (!addonPlan?.stripe_price_id) {
        toast({
          title: "Add-on unavailable",
          description: "The credit add-on isn't configured yet. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: addonPlan.stripe_price_id, mode: "payment" },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error("Error starting credit top-up checkout:", err);
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full">
      <div className="p-4 md:p-6">
        <SubscriptionHeader />
        <ReferralCodeInput />

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 text-sm text-foreground">
          <span className="font-medium">How credits work:</span>{" "}
          <span className="text-muted-foreground">1 credit = 1 minute of talk time.</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CreditDisplay 
            onUpgrade={() => {
              document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            onTopUp={handleTopUp}
          />
          <CreditTransactionHistory />
        </div>

        <CurrentPlanUsage 
          features={features} 
          billingData={billingData} 
          usagePercentage={usagePercentage} 
        />

        <AgentUsageTable billingData={billingData} />

        {billingData?.monthlySummary && (
          <MonthlySummary monthlySummary={billingData.monthlySummary} />
        )}
      </div>

      <div id="pricing-section" className="p-4 md:p-6 pt-0">
        <PricingPlans />
      </div>
    </div>
  );
};
