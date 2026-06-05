
import { Button } from "@/components/ui/button";
import { ArrowRight, Phone, CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { TryRingsterModal } from "./TryRingsterModal";

export const Hero = () => {
  const isMobile = useIsMobile();

  const handleBookDemo = () => {
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'Lead', {
        content_name: 'Book Demo Click',
        content_category: 'Demo Request'
      });
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Abstract background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/4 left-1/2 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-3xl" />
      </div>
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="container relative mx-auto px-4 py-20 sm:py-28 lg:py-36">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Built for small business owners who hate missing calls</span>
          </div>

          {/* Main headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-white mb-6 animate-fade-in">
            Ringster answers your calls,
            <span className="block mt-2 bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent">
              qualifies the caller, books or transfers—
            </span>
            <span className="block mt-2 text-white/90">
              and only interrupts you when it matters.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mx-auto mb-8 animate-fade-in">
            Stop letting voicemail eat your leads. Your AI receptionist handles calls 24/7—no hiring, no training, no being glued to your phone.
          </p>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-10 animate-fade-in">
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm">Sounds human, not robotic</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm">Setup in 5 minutes</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm">No hidden costs</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            <TryRingsterModal
              trigger={
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 text-lg px-8 py-6 group"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  Hear It In Action
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              }
            />
            <Button 
              variant="outline" 
              size="lg"
              asChild
              className="w-full sm:w-auto border-slate-700 text-white bg-transparent hover:bg-white/5 hover:border-slate-600 text-lg px-8 py-6"
              onClick={handleBookDemo}
            >
              <Link to="/signup">
                Start Free Trial
              </Link>
            </Button>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-sm text-slate-300 animate-fade-in">
            Trusted by 200+ service businesses • No credit card required
          </p>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};
