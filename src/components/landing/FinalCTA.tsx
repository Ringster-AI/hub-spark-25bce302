
import { Button } from "@/components/ui/button";
import { Phone, ArrowRight, Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { TryRingsterModal } from "./TryRingsterModal";

export const FinalCTA = () => {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Limited Time: Founders Pricing</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Stop losing leads to voicemail.
            <span className="block mt-2 text-white/80">Start winning them with Ringster.</span>
          </h2>

          <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
            Join hundreds of small business owners who've stopped playing phone tag and started capturing every opportunity.
          </p>

          {/* Benefits list */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mb-10">
            <div className="flex items-center gap-2 text-slate-300">
              <Check className="h-5 w-5 text-emerald-400" />
              <span>7-day free trial</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Check className="h-5 w-5 text-emerald-400" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Check className="h-5 w-5 text-emerald-400" />
              <span>Cancel anytime</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              asChild
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 text-lg px-8 py-6"
            >
              <Link to="/signup">
                Start Your Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <TryRingsterModal
              trigger={
                <Button 
                  variant="outline" 
                  size="lg"
                  className="w-full sm:w-auto border-slate-700 text-white bg-transparent hover:bg-white/5 hover:border-slate-600 text-lg px-8 py-6"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  Hear a Demo Call First
                </Button>
              }
            />
          </div>

          <p className="mt-8 text-sm text-slate-500">
            Questions? Call us at (620) 445-8363 or email support@ringster.ai
          </p>
        </div>
      </div>
    </section>
  );
};
