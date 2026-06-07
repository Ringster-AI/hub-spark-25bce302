import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Phone, 
  Users, 
  Calendar,
  UserPlus,
  CreditCard,
  ArrowRightLeft,
  CalendarCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  type: 'call' | 'campaign' | 'booking' | 'agent' | 'subscription' | 'credit' | 'transfer';
  title: string;
  description: string;
  timestamp: Date;
  status?: 'success' | 'pending' | 'failed';
}

const getActivityIcon = (type: Activity['type']) => {
  const iconMap = {
    call: Phone,
    campaign: Users,
    booking: Calendar,
    agent: UserPlus,
    subscription: CreditCard,
    credit: CreditCard,
    transfer: ArrowRightLeft
  };
  const Icon = iconMap[type];
  return <Icon className="h-4 w-4" />;
};

const getStatusStyles = (status?: Activity['status']) => {
  switch (status) {
    case 'success':
      return "bg-success/10 text-success";
    case 'pending':
      return "bg-warning/10 text-warning";
    case 'failed':
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
};

// Example activities to show when no real activity exists
const exampleActivities: Omit<Activity, 'id' | 'timestamp'>[] = [
  {
    type: 'call',
    title: 'Incoming call answered',
    description: 'Caller inquiry handled successfully',
    status: 'success'
  },
  {
    type: 'transfer',
    title: 'Call transferred to team member',
    description: 'Transferred to Sales Team',
    status: 'success'
  },
  {
    type: 'booking',
    title: 'Appointment booked',
    description: 'Demo scheduled for tomorrow',
    status: 'success'
  }
];

export const ActivityTimeline = () => {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["recent-activities"],
    queryFn: async () => {
      const activities: Activity[] = [];

      // Run all three queries in parallel
      const [callLogsRes, campaignsRes, bookingsRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("*, agent_configs(name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("campaigns")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("calendar_bookings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      const callLogs = callLogsRes.data;
      const campaigns = campaignsRes.data;
      const bookings = bookingsRes.data;

      if (callLogs) {
        callLogs.forEach(call => {
          activities.push({
            id: call.id,
            type: 'call',
            title: call.status === 'completed' ? 'Call completed' : 'Call attempted',
            description: `${call.agent_configs?.name || 'Agent'} • ${call.duration || 0}s`,
            timestamp: new Date(call.created_at),
            status: call.status === 'completed' ? 'success' : call.status === 'failed' ? 'failed' : 'pending'
          });
        });
      }

      if (campaigns) {
        campaigns.forEach(campaign => {
          activities.push({
            id: campaign.id,
            type: 'campaign',
            title: `Campaign ${campaign.status === 'active' ? 'started' : campaign.status}`,
            description: campaign.name,
            timestamp: new Date(campaign.created_at),
            status: campaign.status === 'active' ? 'success' : 'pending'
          });
        });
      }

      if (bookings) {
        bookings.forEach(booking => {
          activities.push({
            id: booking.id,
            type: 'booking',
            title: 'Appointment booked',
            description: `${booking.attendee_name || 'Guest'} • ${format(new Date(booking.appointment_datetime), 'MMM d, h:mm a')}`,
            timestamp: new Date(booking.created_at),
            status: booking.booking_status === 'confirmed' ? 'success' : 'pending'
          });
        });
      }

      return activities
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 8);
    },

    refetchInterval: 30000
  });

  const hasRealActivity = activities.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="w-9 h-9 bg-muted animate-pulse rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {hasRealActivity ? "Recent Activity" : "Activity you'll see once your agent goes live"}
      </h2>
      
      <div className="bg-card rounded-2xl p-6">
        {!hasRealActivity && (
          <div className="mb-4 px-3 py-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              ✨ Example activity — these events will appear once your agent handles real calls
            </p>
          </div>
        )}
        
        <div className="space-y-1">
          {(hasRealActivity ? activities : exampleActivities.map((a, i) => ({
            ...a,
            id: `example-${i}`,
            timestamp: new Date()
          }))).map((activity, index) => (
            <div 
              key={activity.id} 
              className={cn(
                "flex items-start gap-4 p-3 rounded-xl transition-colors",
                "hover:bg-muted/30",
                !hasRealActivity && "opacity-60"
              )}
            >
              <div className={cn(
                "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                getStatusStyles(activity.status)
              )}>
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {activity.title}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {activity.description}
                </p>
              </div>
              {hasRealActivity && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
