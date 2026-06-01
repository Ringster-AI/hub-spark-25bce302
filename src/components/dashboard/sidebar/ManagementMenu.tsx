import { Mic, BarChart3, Users, Calendar, Headphones, Lock } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useLiveCoachAccess } from "@/hooks/useLiveCoachAccess";
import { useTeamAccess } from "@/hooks/useTeamAccess";

interface ManagementMenuProps {
  onLinkClick?: () => void;
}

export const ManagementMenu = ({ onLinkClick }: ManagementMenuProps) => {
  const location = useLocation();
  const { data: liveCoachAccess } = useLiveCoachAccess();
  const { isLocked: teamLocked } = useTeamAccess();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const menuItems = [
    { path: "/dashboard/calendar", label: "Calendar", icon: Calendar, locked: false },
    { path: "/dashboard/recordings", label: "Recordings", icon: Mic, locked: false },
    { path: "/dashboard/analytics", label: "Analytics", icon: BarChart3, locked: false },
    { path: "/dashboard/team", label: "Team", icon: Users, locked: teamLocked },
  ];

  // Live Call Coach is locked only for Free users (limit === 0)
  const liveCoachLocked = liveCoachAccess?.limit === 0;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider px-6 mb-1">
        Management
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton asChild tooltip={item.label}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center justify-between gap-3 w-full px-6 py-2.5 rounded-lg transition-all duration-150",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    isActive(item.path) && [
                      "text-foreground bg-muted",
                      "border-l-2 border-primary ml-0 rounded-l-none"
                    ]
                  )}
                  onClick={onLinkClick}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <item.icon className={cn(
                      "h-4.5 w-4.5 transition-colors",
                      isActive(item.path) ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className="font-medium truncate">{item.label}</span>
                  </div>
                  {item.locked && (
                    <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

          {/* Live Call Assist (Beta) */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Live Call Assist (Beta)">
              <Link
                to="/dashboard/live-coach"
                className={cn(
                  "flex items-center justify-between gap-3 w-full px-6 py-2.5 rounded-lg transition-all duration-150",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  isActive("/dashboard/live-coach") && [
                    "text-foreground bg-muted",
                    "border-l-2 border-primary ml-0 rounded-l-none"
                  ]
                )}
                onClick={onLinkClick}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Headphones className={cn(
                    "h-4.5 w-4.5 flex-shrink-0 transition-colors",
                    isActive("/dashboard/live-coach") ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="font-medium truncate">Live Call Assist</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {liveCoachLocked && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wide">
                    Beta
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
