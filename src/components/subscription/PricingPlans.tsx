
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { PricingHeader } from "./PricingHeader";
import { PlanCard } from "./PlanCard";
import { PricingPlan } from "./types";

export const PricingPlans = () => {
  const { toast } = useToast();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  useEffect(() => {
    // Track pricing page view
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('year');
      (window as any).fbq('track', 'ViewContent', {
        content_name: 'Pricing Plans',
        content_category: 'Subscription'
      });
    }
  }, []);

const { data: plans, isLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select(`
          *,
          plan_features(*)
        `)
        .order("price");

      if (error) throw error;
      
      return data?.map(plan => ({
        ...plan,
        features: plan.features as PricingPlan['features']
      })) as PricingPlan[];
    },
  });

  const handleUpgrade = async (priceId: string) => {
    try {
      // Track checkout initiation
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'InitiateCheckout', {
          content_category: 'Subscription',
          content_ids: [priceId]
        });
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast({
        title: "Error",
        description: "Failed to start checkout process. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Filter plans based on billing interval
  // Hide credit add-ons (one-time purchases) from main plan listing
  const filteredPlans = plans?.filter(
    (plan) =>
      plan.billing_interval !== 'one_time' &&
      (plan.is_pay_as_you_go || plan.billing_interval === billingInterval) &&
      plan.is_active
  );

  if (isLoading) {
    return <div className="text-center">Loading plans...</div>;
  }

  return (
    <div className="w-full py-8">
      <PricingHeader 
        billingInterval={billingInterval} 
        setBillingInterval={setBillingInterval} 
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredPlans?.map((plan) => (
          <PlanCard 
            key={plan.id}
            plan={plan}
            billingInterval={billingInterval}
            onUpgrade={handleUpgrade}
          />
        ))}
      </div>
    </div>
  );
};
