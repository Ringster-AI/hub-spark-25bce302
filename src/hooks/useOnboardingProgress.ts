import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingChoices = {
  industry?: string;
  useCase?: string;
  agentName?: string;
  greeting?: string;
  voice?: "warm" | "professional" | "friendly";
  tone?: number; // 0 formal - 100 casual
  phoneNumber?: string;
  calendarConnected?: boolean;
  agentId?: string;
};

export type OnboardingProgress = {
  user_id: string;
  current_step: number;
  completed_at: string | null;
  choices: OnboardingChoices;
};

export const TOTAL_STEPS = 5;

export const useOnboardingProgress = () => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: async (): Promise<OnboardingProgress | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // Fallback in case trigger hasn't fired
        const { data: inserted } = await supabase
          .from("onboarding_progress" as any)
          .insert({ user_id: user.id })
          .select()
          .single();
        return inserted as any;
      }
      return data as any;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Pick<OnboardingProgress, "current_step" | "completed_at">> & { choices?: OnboardingChoices }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const current = query.data;
      const nextChoices = patch.choices
        ? { ...(current?.choices || {}), ...patch.choices }
        : current?.choices || {};
      const { data, error } = await supabase
        .from("onboarding_progress" as any)
        .update({
          ...(patch.current_step !== undefined && { current_step: patch.current_step }),
          ...(patch.completed_at !== undefined && { completed_at: patch.completed_at }),
          choices: nextChoices,
        })
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
  });

  return {
    progress: query.data,
    isLoading: query.isLoading,
    isComplete: !!query.data?.completed_at,
    update: update.mutateAsync,
    isUpdating: update.isPending,
  };
};
