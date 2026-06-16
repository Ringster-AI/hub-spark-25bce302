
import { Hero } from "@/components/landing/Hero";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Seo } from "@/components/seo/Seo";
import { Menu } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

// Lazy-load below-the-fold sections to improve LCP and initial bundle size
const FeaturesAndBenefits = lazy(() => import("@/components/landing/FeaturesAndBenefits").then(m => ({ default: m.FeaturesAndBenefits })));
const SoundFamiliar = lazy(() => import("@/components/landing/SoundFamiliar").then(m => ({ default: m.SoundFamiliar })));
const Features = lazy(() => import("@/components/landing/Features").then(m => ({ default: m.Features })));
const Testimonials = lazy(() => import("@/components/landing/Testimonials").then(m => ({ default: m.Testimonials })));
const FinalCTA = lazy(() => import("@/components/landing/FinalCTA").then(m => ({ default: m.FinalCTA })));
const Footer = lazy(() => import("@/components/landing/Footer").then(m => ({ default: m.Footer })));

const Index = () => {
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    track("Landing_Viewed", { path: "/" });
  }, []);
  
  
  return (
    <main className="overflow-x-hidden">
      <Seo 
        title="Ringster — AI Scheduling Assistant & AI Voice Receptionist" 
        description="Ringster is an AI scheduling assistant and AI voice receptionist that answers calls, qualifies leads, and books appointments 24/7 for small businesses."
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": "What is an AI front desk service?", "acceptedAnswer": { "@type": "Answer", "text": "An AI front desk service is a virtual phone assistant that answers incoming calls, responds to common questions, captures caller information, routes calls, and can help book appointments. It gives businesses a way to handle calls 24/7 without needing a full time receptionist." } },
              { "@type": "Question", "name": "How does an AI front desk service work?", "acceptedAnswer": { "@type": "Answer", "text": "An AI front desk service answers your business phone using conversational voice technology. It can greet callers, understand what they need, provide business information, collect lead details, transfer calls to the right person, and follow rules you set for your business." } },
              { "@type": "Question", "name": "Can an AI front desk answer calls after hours?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. One of the main benefits of an AI front desk service is that it can answer calls 24/7, including evenings, weekends, and holidays. This helps businesses capture leads and support customers even when staff are unavailable." } },
              { "@type": "Question", "name": "What types of businesses use AI front desk services?", "acceptedAnswer": { "@type": "Answer", "text": "AI front desk services are commonly used by service businesses such as HVAC companies, plumbers, electricians, clinics, law firms, real estate teams, salons, contractors, and other businesses that need help managing incoming calls and customer inquiries." } },
              { "@type": "Question", "name": "Can an AI front desk transfer calls to my team?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. AI front desk services can transfer calls to you or the right team member based on caller needs, business hours, urgency, or custom routing rules. This helps make sure important calls still reach a real person when needed." } },
              { "@type": "Question", "name": "Can an AI front desk capture leads and customer details?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. AI front desk services can collect caller names, phone numbers, email addresses, appointment requests, service needs, and other important details. This helps businesses avoid losing leads when staff cannot answer the phone." } },
              { "@type": "Question", "name": "Can an AI front desk book appointments?", "acceptedAnswer": { "@type": "Answer", "text": "Many AI front desk services can help with appointment scheduling by collecting booking details or connecting with scheduling workflows. Depending on the setup, the system can qualify the request, confirm availability, and guide callers through the next step." } },
              { "@type": "Question", "name": "Will an AI front desk sound natural to callers?", "acceptedAnswer": { "@type": "Answer", "text": "A well configured AI front desk can sound natural, professional, and conversational. Modern voice systems are designed to understand common customer requests and respond in a way that feels helpful and easy to follow." } },
              { "@type": "Question", "name": "What questions can an AI front desk answer?", "acceptedAnswer": { "@type": "Answer", "text": "An AI front desk can answer common questions about your business such as hours, services, pricing basics, location, availability, service areas, appointment details, and other frequently asked questions based on the information you provide." } },
              { "@type": "Question", "name": "Is an AI front desk better than voicemail?", "acceptedAnswer": { "@type": "Answer", "text": "In most cases, yes. Unlike voicemail, an AI front desk can interact with callers in real time, answer questions, collect useful details, transfer urgent calls, and create a smoother customer experience. This can improve lead capture and reduce missed opportunities." } },
              { "@type": "Question", "name": "How much does an AI front desk service cost?", "acceptedAnswer": { "@type": "Answer", "text": "Pricing varies by provider and usage, but AI front desk services are often more affordable than hiring full time front desk staff. Costs typically depend on factors like call volume, features, number of agents, and integrations." } },
              { "@type": "Question", "name": "Can an AI front desk be customized for my business?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. AI front desk services can usually be customized with your business name, greeting, services, call routing rules, frequently asked questions, lead intake flow, and escalation instructions so the experience matches how your business operates." } },
              { "@type": "Question", "name": "Can an AI front desk help reduce missed calls?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. AI front desk services are designed to answer calls instantly, which helps businesses reduce missed calls, improve response times, and capture more leads from customers who might otherwise hang up or call a competitor." } },
              { "@type": "Question", "name": "Is an AI front desk service hard to set up?", "acceptedAnswer": { "@type": "Answer", "text": "Setup is usually straightforward. Most AI front desk services only need your business information, call handling preferences, and transfer rules to get started. More advanced setups can include appointment flows, lead qualification, and custom integrations." } }
            ]
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Ringster",
            "url": "https://ringster.ai",
            "applicationCategory": "BusinessApplication",
            "applicationSubCategory": "AI Receptionist Software",
            "operatingSystem": "Cloud",
            "description": "Ringster is an AI-powered phone agent platform that helps businesses answer calls automatically, capture leads, route callers, and provide customer information 24/7 without needing a human receptionist.",
            "softwareVersion": "1.0",
            "creator": { "@type": "Organization", "name": "Ringster" },
            "publisher": { "@type": "Organization", "name": "Ringster", "url": "https://ringster.ai" },
            "featureList": [
              "AI phone agents that answer calls automatically",
              "24/7 call answering for businesses",
              "Call routing and transfers to team members",
              "Lead capture from inbound callers",
              "Business information responses",
              "Custom greetings and call flows",
              "AI-powered conversational voice interactions"
            ],
            "offers": { "@type": "Offer", "priceCurrency": "USD", "availability": "https://schema.org/InStock", "category": "Subscription" },
          "audience": { "@type": "Audience", "audienceType": "Small Businesses, Service Businesses, Entrepreneurs" }
          },
          {
            "@context": "https://schema.org",
            "@type": "HowTo",
            "@id": "https://ringster.ai/how-it-works#howto",
            "name": "How to set up Ringster for your business",
            "description": "Set up Ringster to answer business calls, capture leads, and route callers automatically.",
            "step": [
              { "@type": "HowToStep", "position": 1, "name": "Create your Ringster account", "text": "Sign up and access your Ringster dashboard." },
              { "@type": "HowToStep", "position": 2, "name": "Add your business information", "text": "Enter your business name, hours, services, and the key details Ringster should share with callers." },
              { "@type": "HowToStep", "position": 3, "name": "Configure call handling", "text": "Set your greeting, routing rules, transfer numbers, and any lead capture questions." },
              { "@type": "HowToStep", "position": 4, "name": "Test your AI receptionist", "text": "Call your number, review the conversation flow, and refine responses as needed." },
              { "@type": "HowToStep", "position": 5, "name": "Go live", "text": "Publish your setup so Ringster can begin answering customer calls." }
            ]
          }
        ]}
      />
      
      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <Link to="/">
              <img 
                src="/lovable-uploads/059d2b53-6e4e-4788-a607-2344b4097212.png" 
                alt="Ringster Logo" 
                className="h-10 sm:h-12 md:h-14 w-auto"
              />
            </Link>
            
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
                About
              </Link>
              <Link to="/roi-calculator" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
                ROI Calculator
              </Link>
              <Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
                Blog
              </Link>
              <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
                Contact
              </Link>
              <Button asChild variant="outline" size="sm">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Start Free Trial</Link>
              </Button>
            </div>

            {/* Mobile menu button */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="md:hidden pt-4 pb-2 border-t border-border mt-3">
              <div className="flex flex-col gap-3">
                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors py-2">
                  About
                </Link>
                <Link to="/roi-calculator" className="text-muted-foreground hover:text-primary transition-colors py-2">
                  ROI Calculator
                </Link>
                <Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors py-2">
                  Blog
                </Link>
                <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors py-2">
                  Contact
                </Link>
                <div className="flex gap-3 pt-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link to="/login">Login</Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1">
                    <Link to="/signup">Start Free Trial</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="pt-16 sm:pt-18 md:pt-20">
        <Hero />
        <FeaturesAndBenefits />
        <SoundFamiliar />
        <Features />
        <Testimonials />
        
        {/* FAQ Section */}
        <section className="py-16 md:py-20 bg-background">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-muted-foreground">
                Everything you need to know before getting started
              </p>
            </div>
            
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem value="sound" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    Does it really sound human?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    Yes! Our AI uses advanced voice synthesis that sounds natural and professional. Most callers can't tell they're talking to AI. Try a demo call yourself and you'll hear the difference.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="setup" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    How long does setup take?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    About 5 minutes. You'll answer a few questions about your business, customize your greeting, and you're live. No technical skills required.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cost" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    What does it cost?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    Plans start at $49/month for small businesses. That's less than one missed lead for most service businesses. We offer a 7-day free trial with no credit card required.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="transfer" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    What if I need to take an urgent call?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    You set the rules. Ringster can transfer calls to you immediately based on keywords, caller ID, or type of request. Urgent matters get to you right away.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="number" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    Do I need a new phone number?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    You can keep your existing number! We'll forward calls to your Ringster AI, or you can get a new dedicated number. Either way, setup is simple.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cancel" className="bg-card rounded-xl border border-border px-6">
                  <AccordionTrigger className="text-foreground hover:text-primary py-4">
                    Can I cancel anytime?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    Absolutely. No contracts, no cancellation fees. If Ringster isn't working for your business, you can cancel with one click.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </section>

        <FinalCTA />
      </div>
      <Footer />
    </main>
  );
};

export default Index;
