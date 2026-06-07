import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditsService } from "@/services/creditsService";
import { CreditStatus } from "@/types/credits";
import { supabase } from "@/integrations/supabase/client";

export const useCredits = () => {
  const queryClient = useQueryClient();

  const { data: creditStatus, isLoading, error } = useQuery({
    queryKey: ["credits"],
    queryFn: () => CreditsService.getCreditStatus(),
    // Realtime subscription below replaces the previous 30s polling.
    staleTime: 10000,
  });

  // Subscribe to user_credits changes for the current user and invalidate the
  // query (and notify other listeners) on every change. This eliminates the
  // 30s poll fan-out at scale.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`user_credits:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_credits",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["credits"] });
            window.dispatchEvent(new Event("credits:refresh"));
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deductCredits = async (creditsAmount: number, description?: string, callLogId?: string) => {
    const success = await CreditsService.deductCredits(creditsAmount, description, callLogId);
    if (success) {
      // Invalidate and refetch credits data
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    }
    return success;
  };

  const addCredits = async (creditsAmount: number, creditType: 'plan' | 'add_on' = 'add_on', description?: string) => {
    const success = await CreditsService.addCredits(creditsAmount, creditType, description);
    if (success) {
      // Invalidate and refetch credits data
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    }
    return success;
  };

  const hasEnoughCredits = (creditsRequired: number): boolean => {
    return creditStatus ? creditStatus.remainingCredits >= creditsRequired : false;
  };

  return {
    creditStatus: creditStatus as CreditStatus | null,
    isLoading,
    error,
    deductCredits,
    addCredits,
    hasEnoughCredits,
    refreshCredits: () => queryClient.invalidateQueries({ queryKey: ["credits"] }),
  };
};