import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FirstCallInfo = {
  callId: string;
  fromNumber: string | null;
  toNumber: string | null;
  duration: number | null;
  startTime: string | null;
  recordingUrl: string | null;
};

type Result = {
  shouldCelebrate: boolean;
  call: FirstCallInfo | null;
  acknowledge: () => Promise<void>;
};

export const useFirstCallCelebration = (): Result => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["first-call-celebration"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ack: true, call: null as FirstCallInfo | null };

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_call_acknowledged_at")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.first_call_acknowledged_at) {
        return { ack: true, call: null };
      }

      // Get user's agents
      const { data: agents } = await supabase
        .from("agent_configs")
        .select("id")
        .eq("user_id", user.id);

      const agentIds = (agents || []).map((a) => a.id);
      if (agentIds.length === 0) return { ack: false, call: null };

      const { data: calls } = await supabase
        .from("call_logs")
        .select("id, from_number, to_number, duration, start_time")
        .in("agent_id", agentIds)
        .order("created_at", { ascending: true })
        .limit(1);

      const firstCall = calls?.[0];
      if (!firstCall) return { ack: false, call: null };

      const { data: rec } = await supabase
        .from("call_recordings")
        .select("recording_url")
        .eq("call_log_id", firstCall.id)
        .maybeSingle();

      return {
        ack: false,
        call: {
          callId: firstCall.id,
          fromNumber: firstCall.from_number,
          toNumber: firstCall.to_number,
          duration: firstCall.duration,
          startTime: firstCall.start_time,
          recordingUrl: rec?.recording_url ?? null,
        },
      };
    },
    refetchInterval: 60_000,
  });

  // Realtime: refetch whenever a new call_log row arrives
  useEffect(() => {
    const channel = supabase
      .channel("first-call-celebration")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        () => qc.invalidateQueries({ queryKey: ["first-call-celebration"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const ack = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ first_call_acknowledged_at: new Date().toISOString() })
        .eq("id", user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["first-call-celebration"] }),
  });

  return {
    shouldCelebrate: !query.data?.ack && !!query.data?.call,
    call: query.data?.call ?? null,
    acknowledge: async () => {
      await ack.mutateAsync();
    },
  };
};
