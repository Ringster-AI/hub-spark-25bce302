import { useParams, Link, Navigate } from "react-router-dom";
import { LandingNav } from "@/components/landing/LandingNav";
import { Footer } from "@/components/landing/Footer";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Phone, Clock, DollarSign, CalendarCheck, MessageSquare, TrendingUp, MapPin } from "lucide-react";
import { industries, industryList, type Industry } from "@/data/programmatic/industries";
import { cities, cityBySlug, citiesInSameState, type City } from "@/data/programmatic/cities";

const BASE_URL = "https://getringster.com";

const IndustryFeatures = ({ industry }: { industry: Industry }) => {
  const features = [
    { icon: Phone, title: "Instant Call Answering", desc: "Every call answered on the first ring, even during peak hours." },
    { icon: Clock, title: "24/7 Coverage", desc: "Nights, weekends, holidays — your phone is always covered." },
    { icon: DollarSign, title: "Lead Qualification", desc: "Captures name, contact, issue, and urgency from every caller." },
    { icon: CalendarCheck, title: "Appointment Booking", desc: "Books directly based on your team's availability." },
    { icon: MessageSquare, title: "Custom Scripts", desc: `Trained on your ${industry.name.toLowerCase()} business specifics.` },
    { icon: TrendingUp, title: "Performance Analytics", desc: "Track call volume, lead quality, and conversion." },
  ];
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {features.map((f) => (
        <div key={f.title} className="bg-card border border-border rounded-xl p-6">
          <f.icon className="h-8 w-8 text-primary mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
          <p className="text-sm text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
};

interface Props {
  /** When set, this is the industry hub page (no city). Otherwise both come from URL params. */
  industryKey?: string;
}

const ProgrammaticLanding = ({ industryKey }: Props) => {
  const params = useParams<{ industry: string; city?: string }>();
  const industrySlug = industryKey ?? params.industry;
  const citySlug = params.city;

  const industry = industrySlug ? industries[industrySlug] : undefined;
  const city: City | undefined = citySlug ? cityBySlug.get(citySlug) : undefined;

  // Unknown industry → 404. Unknown city (when city param exists) → 404.
  if (!industry) return <Navigate to="/" replace />;
  if (citySlug && !city) return <Navigate to={`/ai-receptionist-for-${industry.slug}`} replace />;

  const isCityPage = !!city;
  const headline = city ? industry.cityHeadline(city.name) : industry.headline;
  const subheadline = city
    ? `${industry.plural.charAt(0).toUpperCase() + industry.plural.slice(1)} in ${city.name}, ${city.stateCode} lose customers to missed calls. Ringster answers every call 24/7, books appointments, and captures leads — even when you can't pick up.`
    : industry.subheadline;

  const path = city
    ? `/ai-receptionist-for-${industry.slug}/${city.slug}`
    : `/ai-receptionist-for-${industry.slug}`;
  const canonical = `${BASE_URL}${path}`;

  const title = city
    ? `AI Receptionist for ${industry.plural.charAt(0).toUpperCase() + industry.plural.slice(1)} in ${city.name}, ${city.stateCode} — Ringster`
    : `AI Receptionist for ${industry.name} — Ringster`;
  const description = city
    ? `Ringster's AI receptionist for ${industry.plural} in ${city.name}, ${city.stateCode}. Answers every call 24/7, books appointments, captures leads. Try free.`
    : `${industry.name} businesses lose revenue to missed calls. Ringster's AI receptionist answers every call, captures leads, and books jobs 24/7. Try free.`;

  // Local FAQ appended for city pages (dedup risk mitigated — always distinct wording).
  const faqs = city
    ? [
        {
          q: `Does Ringster work for ${industry.plural} in ${city.name}?`,
          a: `Yes. Ringster's AI receptionist works with any US phone number, including your existing ${city.name}, ${city.stateCode} business line. Setup takes under 5 minutes and Ringster is answering calls the same day.`,
        },
        ...industry.faqs,
      ]
    : industry.faqs;

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": `Ringster AI Receptionist for ${industry.name}${city ? ` in ${city.name}` : ""}`,
      "url": canonical,
      "description": description,
      "provider": { "@type": "Organization", "name": "Ringster", "url": BASE_URL },
      "serviceType": "AI Receptionist",
      "areaServed": city
        ? { "@type": "City", "name": city.name, "containedInPlace": { "@type": "State", "name": city.state } }
        : "US",
      "audience": { "@type": "Audience", "audienceType": `${industry.name} Businesses` },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map((f) => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    },
  ];

  // Cross-links: for city pages show sibling cities in same state + siblings industries in same city.
  const siblingCities = city ? citiesInSameState(city, 8) : cities.slice(0, 12);
  const siblingIndustries = industryList.filter((i) => i.slug !== industry.slug).slice(0, 6);

  return (
    <main className="overflow-x-hidden">
      <Seo title={title} description={description} canonical={canonical} jsonLd={jsonLd} />
      <LandingNav />

      <div className="pt-20">
        {/* Hero */}
        <section className="py-20 md:py-28 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute -top-1/3 -right-1/4 w-[700px] h-[700px] rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="container mx-auto px-4 sm:px-6 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                {city ? (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> Serving {city.name}, {city.stateCode}
                  </span>
                ) : (
                  <>Built for {industry.name} Businesses</>
                )}
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">{headline}</h1>
              <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto">{subheadline}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="text-lg px-8"><Link to="/signup">Start Free Trial</Link></Button>
                <Button asChild size="lg" variant="outline" className="text-lg px-8 border-slate-600 text-slate-200 hover:bg-slate-800">
                  <Link to="/how-it-works">See How It Works</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Local intro (city page only) */}
        {city && (
          <section className="py-12 bg-background border-b border-border">
            <div className="container mx-auto px-4 sm:px-6">
              <p className="max-w-3xl mx-auto text-center text-lg text-muted-foreground leading-relaxed">
                {industry.cityIntro(city.name, city.state)}
              </p>
            </div>
          </section>
        )}

        {/* Stats */}
        <section className="py-12 bg-primary/5 border-y border-border">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
              {industry.stats.map((s) => (
                <div key={s.label}>
                  <div className="text-4xl font-bold text-primary mb-1">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pain points */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-center mb-4">
              {city ? `Why ${city.name} ${industry.plural} choose Ringster` : "Sound Familiar?"}
            </h2>
            <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              These are the problems {industry.plural} face every day. Ringster solves them all.
            </p>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {industry.painPoints.map((p) => (
                <div key={p.title} className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 bg-muted/50">
          <div className="container mx-auto px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-center mb-12">
              What Ringster does for {city ? `${industry.plural} in ${city.name}` : `your ${industry.name.toLowerCase()} business`}
            </h2>
            <IndustryFeatures industry={industry} />
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-foreground text-center mb-12">
              {city ? `${city.name} ${industry.name} AI Receptionist FAQ` : `${industry.name} AI Receptionist FAQ`}
            </h2>
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="space-y-3">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="bg-card rounded-xl border border-border px-6">
                    <AccordionTrigger className="text-foreground hover:text-primary py-4 text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-4">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* Cross-links: sibling cities + sibling industries */}
        <section className="py-16 bg-muted/40 border-t border-border">
          <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
            {city && siblingCities.length > 0 && (
              <div className="mb-12">
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  AI Receptionist for {industry.plural} in other {city.state} cities
                </h3>
                <div className="flex flex-wrap gap-2">
                  {siblingCities.map((c) => (
                    <Link
                      key={c.slug}
                      to={`/ai-receptionist-for-${industry.slug}/${c.slug}`}
                      className="px-4 py-2 rounded-full bg-card border border-border text-sm text-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-4">
                {city ? `Other industries Ringster serves in ${city.name}` : "Other industries Ringster serves"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {siblingIndustries.map((i) => (
                  <Link
                    key={i.slug}
                    to={city ? `/ai-receptionist-for-${i.slug}/${city.slug}` : `/ai-receptionist-for-${i.slug}`}
                    className="px-4 py-2 rounded-full bg-card border border-border text-sm text-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    {i.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-r from-primary to-primary/80">
          <div className="container mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
              {city ? `Ready to capture every ${industry.name.toLowerCase()} lead in ${city.name}?` : `Ready to capture every ${industry.name.toLowerCase()} lead?`}
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Start your free trial and have your AI receptionist answering calls in under 5 minutes.
            </p>
            <Button asChild size="lg" variant="secondary" className="text-lg px-8">
              <Link to="/signup">Start Free Trial</Link>
            </Button>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  );
};

export default ProgrammaticLanding;
