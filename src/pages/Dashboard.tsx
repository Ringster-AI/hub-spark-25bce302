
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Routes, Route } from "react-router-dom";
import BlogAdmin from "./Dashboard/BlogAdmin";
import NewBlogPost from "./Dashboard/NewBlogPost";
import EditBlogPost from "./Dashboard/EditBlogPost";
import { SidebarProvider } from "@/components/ui/sidebar";
import Overview from "./Dashboard/Overview";
import Agents from "./Dashboard/Agents";
import Campaigns from "./Dashboard/Campaigns";
import CampaignDetails from "./Dashboard/CampaignDetails";
import CampaignDashboard from "./Dashboard/CampaignDashboard";
import Recordings from "./Dashboard/Recordings";
import Analytics from "./Dashboard/Analytics";
import Team from "./Dashboard/Team";
import Settings from "./Dashboard/Settings";
import Subscription from "./Dashboard/Subscription";
import Profile from "./Dashboard/Profile";
import Calendar from "./Dashboard/Calendar";
import LiveCoach from "./Dashboard/LiveCoach";
import { FeedbackDialog } from "@/components/dashboard/FeedbackDialog";
import { FirstCallCelebration } from "@/components/onboarding/FirstCallCelebration";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CreditsService } from "@/services/creditsService";

type CheckoutOutcome = "success" | "cancelled";

const trackCheckoutEvent = (
  outcome: CheckoutOutcome,
  extra: Record<string, unknown> = {}
) => {
  const payload = { outcome, ...extra, timestamp: new Date().toISOString() };
  try {
    if (typeof window !== "undefined") {
      const w = window as any;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ event: "stripe_checkout_return", ...payload });
      if (typeof w.fbq === "function") {
        w.fbq("trackCustom", "StripeCheckoutReturn", payload);
      }
    }
  } catch (err) {
    console.warn("Analytics tracking failed:", err);
  }
};

const Dashboard = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutStatus = params.get("checkout");
    const sessionId = params.get("session_id");
    if (!checkoutStatus) return;

    if (checkoutStatus === "success") {
      // Capture the pre-refresh balance to detect whether the webhook
      // actually credited the account within the polling window.
      let baselineCredits: number | null = null;
      let refreshSucceeded = false;

      const captureBaseline = async () => {
        try {
          const status = await CreditsService.getCreditStatus();
          baselineCredits = status?.totalCredits ?? null;
        } catch {
          baselineCredits = null;
        }
      };

      const refresh = async () => {
        queryClient.invalidateQueries({ queryKey: ["credits"] });
        window.dispatchEvent(new CustomEvent("credits:refresh"));
        if (refreshSucceeded) return;
        try {
          const status = await CreditsService.getCreditStatus();
          if (
            status &&
            baselineCredits !== null &&
            status.totalCredits > baselineCredits
          ) {
            refreshSucceeded = true;
          }
        } catch {
          /* ignore — final outcome reported in cleanup */
        }
      };

      const timers: ReturnType<typeof setTimeout>[] = [];
      captureBaseline().then(() => {
        refresh();
        [1500, 4000, 8000].forEach((ms) => timers.push(setTimeout(refresh, ms)));
      });

      // Report the final refresh result after the polling window.
      const reportTimer = setTimeout(() => {
        trackCheckoutEvent("success", {
          credit_refresh: refreshSucceeded ? "succeeded" : "pending",
          baseline_credits: baselineCredits,
          session_id: sessionId,
        });
      }, 9000);
      timers.push(reportTimer);

      toast({
        title: "Payment successful",
        description: "Your credits will appear shortly.",
      });

      // Clean the URL so refreshes don't retrigger the toast.
      params.delete("checkout");
      params.delete("session_id");
      navigate(
        { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
        { replace: true }
      );

      return () => timers.forEach(clearTimeout);
    }

    if (checkoutStatus === "cancelled" || checkoutStatus === "canceled") {
      trackCheckoutEvent("cancelled", { session_id: sessionId });
      toast({
        title: "Checkout cancelled",
        description: "No changes were made to your account.",
      });
      params.delete("checkout");
      params.delete("session_id");
      navigate(
        { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
        { replace: true }
      );
    }
  }, [location.search, location.pathname, navigate, queryClient, toast]);

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile && (
            <div className="border-b p-2 flex items-center justify-between bg-background">
              <SidebarTrigger>
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <img 
                src="/lovable-uploads/059d2b53-6e4e-4788-a607-2344b4097212.png" 
                alt="Ringster Logo" 
                className="h-8 w-auto"
              />
              <div className="w-5"></div> {/* Empty div for flex spacing */}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/:campaignId" element={<CampaignDetails />} />
              <Route path="/campaigns/:campaignId/dashboard" element={<CampaignDashboard />} />
              <Route path="/recordings" element={<Recordings />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/live-coach" element={<LiveCoach />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/team" element={<Team />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/blog" element={<BlogAdmin />} />
              <Route path="/blog/new" element={<NewBlogPost />} />
              <Route path="/blog/edit/:id" element={<EditBlogPost />} />
            </Routes>
          </div>
        </div>
        <FeedbackDialog />
        <FirstCallCelebration />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
