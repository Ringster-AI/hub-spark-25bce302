
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PrimaryKPIs } from "@/components/dashboard/overview/PrimaryKPIs";
import { QuickActions } from "@/components/dashboard/overview/QuickActions";
import { ActivityTimeline } from "@/components/dashboard/overview/ActivityTimeline";
import { SystemStatus } from "@/components/dashboard/overview/SystemStatus";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { IndustryTipsCard } from "@/components/onboarding/IndustryTipsCard";

interface DashboardStats {
  totalCalls: number;
  callsThisWeek: number;
  activeAgents: number;
  missedCalls: number;
  afterHoursCalls: number;
  scheduledBookings: number;
}

const Overview = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch all call logs
      const { data: callLogs, count: totalCalls } = await supabase
        .from("call_logs")
        .select("*", { count: "exact" });

      // Fetch this week's calls
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const { count: callsThisWeek } = await supabase
        .from("call_logs")
        .select("*", { count: "exact" })
        .gte("created_at", oneWeekAgo.toISOString());

      // Fetch active agents
      const { count: activeAgents } = await supabase
        .from("agent_configs")
        .select("*", { count: "exact" })
        .eq("status", "active");

      // Calculate missed calls (failed status)
      const { count: missedCalls } = await supabase
        .from("call_logs")
        .select("*", { count: "exact" })
        .eq("status", "failed")
        .gte("created_at", oneWeekAgo.toISOString());

      // Calculate after hours calls (simplified - calls between 6PM and 8AM)
      const afterHoursCalls = callLogs?.filter(call => {
        const callHour = new Date(call.created_at).getHours();
        return callHour >= 18 || callHour < 8;
      }).length || 0;

      // Fetch scheduled bookings
      const { count: scheduledBookings } = await supabase
        .from("calendar_bookings")
        .select("*", { count: "exact" })
        .eq("booking_status", "confirmed")
        .gte("appointment_datetime", new Date().toISOString());

      return {
        totalCalls: totalCalls || 0,
        callsThisWeek: callsThisWeek || 0,
        activeAgents: activeAgents || 0,
        missedCalls: missedCalls || 0,
        afterHoursCalls,
        scheduledBookings: scheduledBookings || 0
      };
    },
    refetchInterval: 60000
  });

  // Check if user has any agents
  const { data: hasAgents } = useQuery({
    queryKey: ["has-agents"],
    queryFn: async () => {
      const { count } = await supabase
        .from("agent_configs")
        .select("*", { count: "exact" });
      return (count || 0) > 0;
    }
  });

  return (
    <div className="p-4 md:p-10 space-y-6 md:space-y-10 w-full">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="text-muted-foreground text-base md:text-lg">
          Here's how your agents are performing
        </p>
      </div>

      <OnboardingChecklist />
      <IndustryTipsCard />

      {/* Primary KPIs - 3 cards */}
      <PrimaryKPIs 
        stats={stats}
        isLoading={statsLoading}
        hasAgents={hasAgents ?? false}
      />

      {/* System Status - Reassurance element */}
      <SystemStatus activeAgents={stats?.activeAgents || 0} />

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left Column - Quick Actions */}
        <div className="lg:col-span-2 space-y-8">
          <QuickActions hasAgents={hasAgents ?? false} />
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="lg:col-span-3">
          <ActivityTimeline />
        </div>
      </div>
    </div>
  );
};

export default Overview;
