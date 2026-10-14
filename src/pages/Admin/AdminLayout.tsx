import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Shield, Bot, ArrowLeft, Wrench, ShieldAlert, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

const navItems = [
  { to: "/admin/agents", label: "Agents", icon: Bot },
  { to: "/admin/tools", label: "Tools", icon: Wrench },
  { to: "/admin/compliance", label: "Compliance", icon: ShieldAlert },
  { to: "/admin/partners", label: "Partners", icon: Handshake },
];

export const AdminLayout = () => {
  const { data: isAdmin, isLoading } = useSuperAdmin();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Checking access…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" />
            Admin
          </div>
          <p className="text-xs text-muted-foreground mt-1">Super admin tools</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </NavLink>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
