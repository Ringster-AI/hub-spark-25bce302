import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionFeatures } from "./useSubscriptionFeatures";

export interface TeamAccess {
  seatsLimit: number;
  seatsUsed: number;
  devicesLimit: number;
  canInvite: boolean;
  isLocked: boolean;
  planName: string;
  isLoading: boolean;
}

export const useTeamAccess = (): TeamAccess => {
  const { subscription, features, isLoading: subLoading } = useSubscriptionFeatures();

  const seatsLimit = features.limits.maxTeamMembers ?? 0;
  const devicesLimit = (subscription?.plan as any)?.max_mobile_devices ?? 1;
  const planName = subscription?.plan?.name ?? "Free";

  const { data: seatsUsed = 0, isLoading: countLoading } = useQuery({
    queryKey: ["team-members-count"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count } = await supabase
        .from("team_members" as any)
        .select("*", { count: "exact", head: true })
        .eq("owner_user_id", user.id)
        .neq("status", "revoked");
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  return {
    seatsLimit,
    seatsUsed,
    devicesLimit,
    canInvite: seatsUsed < seatsLimit,
    isLocked: seatsLimit === 0,
    planName,
    isLoading: subLoading || countLoading,
  };
};
