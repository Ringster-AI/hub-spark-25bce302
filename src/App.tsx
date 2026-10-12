import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Index from "./pages/Index";
import AIReceptionist from "./pages/AIReceptionist";
import HowItWorks from "./pages/HowItWorks";
import Pricing from "./pages/Pricing";
import FAQ from "./pages/FAQ";
import IndustryLanding from "./pages/IndustryLanding";
import Blog from "./pages/Blog";
import Contact from "./pages/Contact";
import Dashboard from "./pages/Dashboard";
import BlogAdmin from "./pages/Dashboard/BlogAdmin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import About from "./pages/About";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BlogPost from "./pages/BlogPost";
import Ebook from "./pages/Ebook";
import EbookThankYou from "./pages/EbookThankYou";
import Offer from "./pages/Offer";
import ROICalculator from "./pages/ROICalculator";
import { CookieConsentBanner } from "@/components/consent/CookieConsentBanner";
import { ScrollToTop } from "@/components/ScrollToTop";
import Onboarding from "./pages/Onboarding";
import AdminLayout from "./pages/Admin/AdminLayout";
import AdminAgentsList from "./pages/Admin/Agents/AdminAgentsList";
import AdminAgentDetail from "./pages/Admin/Agents/AdminAgentDetail";
import AdminTools from "./pages/Admin/Tools/AdminTools";
import AcceptInvite from "./pages/AcceptInvite";
import Unsubscribe from "./pages/Unsubscribe";
import EmailChangeCallback from "./pages/EmailChangeCallback";
import OAuthConsent from "./pages/OAuthConsent";
import ProgrammaticLanding from "./pages/ProgrammaticLanding";

const queryClient = new QueryClient();

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          if (error.message.includes('refresh_token_not_found')) {
            await supabase.auth.signOut();
            toast({
              title: "Session expired",
              description: "Please sign in again",
              variant: "destructive",
            });
          }
          setIsAuthenticated(false);
          return;
        }
        
        setIsAuthenticated(!!session);
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setIsAuthenticated(true);
      } else if (event === 'INITIAL_SESSION') {
        setIsAuthenticated(!!session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [toast]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/ai-receptionist" element={<AIReceptionist />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/ai-receptionist-for-plumbers" element={<IndustryLanding industryKey="plumbers" />} />
            <Route path="/ai-receptionist-for-hvac" element={<IndustryLanding industryKey="hvac" />} />
            <Route path="/ai-receptionist-for-electricians" element={<IndustryLanding industryKey="electricians" />} />
            {/* Programmatic hubs (9 new) + industry x city pages for all 12. React Router v6 needs
                dynamic segments to occupy a whole path segment, so we enumerate industry slugs and
                use :city for the city variant. ProgrammaticLanding reads the industry from the
                explicit industryKey prop (hub) or matches useParams (city). */}
            {[
              ["plumbers", "plumbers"],
              ["hvac", "hvac"],
              ["electricians", "electricians"],
              ["salons", "salons"],
              ["cleaning", "cleaning"],
              ["real-estate", "real-estate"],
              ["law-firms", "law-firms"],
              ["dentists", "dentists"],
              ["general-contractors", "general-contractors"],
              ["roofers", "roofers"],
              ["landscapers", "landscapers"],
              ["med-spas", "med-spas"],
            ].map(([slug, key]) => (
              <Route
                key={`city-${slug}`}
                path={`/ai-receptionist-for-${slug}/:city`}
                element={<ProgrammaticLanding industryKey={key} />}
              />
            ))}
            {/* Hub pages for the 9 new industries (existing 3 have their own hand-crafted routes above). */}
            {["salons","cleaning","real-estate","law-firms","dentists","general-contractors","roofers","landscapers","med-spas"].map((slug) => (
              <Route
                key={`hub-${slug}`}
                path={`/ai-receptionist-for-${slug}`}
                element={<ProgrammaticLanding industryKey={slug} />}
              />
            ))}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/about" element={<About />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/ebook" element={<Ebook />} />
            <Route path="/ebook-thank-you" element={<EbookThankYou />} />
            <Route path="/offer" element={<Offer />} />
            <Route path="/roi-calculator" element={<ROICalculator />} />
            <Route path="/team/accept-invite" element={<AcceptInvite />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/auth/email-change/callback" element={<EmailChangeCallback />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/onboarding" element={
              <PrivateRoute>
                <Onboarding />
              </PrivateRoute>
            } />
            <Route path="/dashboard/*" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="/admin" element={
              <PrivateRoute>
                <AdminLayout />
              </PrivateRoute>
            }>
              <Route index element={<Navigate to="/admin/agents" replace />} />
              <Route path="agents" element={<AdminAgentsList />} />
              <Route path="agents/:id" element={<AdminAgentDetail />} />
              <Route path="tools" element={<AdminTools />} />
              <Route path="compliance" element={<AdminComplianceReview />} />
            </Route>
          </Routes>
          <CookieConsentBanner />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
