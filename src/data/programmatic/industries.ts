// Industry data for programmatic "AI receptionist for {industry} in {city}" pages.
// The 3 existing static routes (plumbers/hvac/electricians) still use src/pages/IndustryLanding.tsx —
// this file powers the city variants for all 12 industries and the hub pages for the 9 new ones.

export interface Industry {
  slug: string;              // matches URL: /ai-receptionist-for-:industry
  name: string;              // "Plumbing", "Salon", used in copy
  plural: string;            // "plumbers", "salons", used in copy
  headline: string;          // industry hub headline (no city)
  subheadline: string;
  cityHeadline: (city: string) => string;   // city-specific H1
  cityIntro: (city: string, state: string) => string; // 1-2 sentence local intro
  painPoints: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  stats: { value: string; label: string }[];
}

export const industries: Record<string, Industry> = {
  plumbers: {
    slug: "plumbers",
    name: "Plumbing",
    plural: "plumbers",
    headline: "Stop Losing Emergency Plumbing Calls to Voicemail",
    subheadline: "When a pipe bursts at 2 AM, your customer calls the first plumber who answers. With Ringster, that's always you.",
    cityHeadline: (city) => `AI Receptionist for Plumbers in ${city}`,
    cityIntro: (city, state) => `Serving plumbing businesses across ${city}, ${state} — Ringster answers every emergency call, dispatches urgent jobs, and books routine service around the clock, so ${city} homeowners always reach you first.`,
    painPoints: [
      { title: "Missing calls while on the job", description: "You're under a house fixing a leak and can't answer. Ringster handles the call, captures details, and texts you the lead." },
      { title: "After-hours emergencies go to competitors", description: "Emergency calls at night or weekends are your highest-value jobs. Ringster answers 24/7 and dispatches urgent calls to your on-call team." },
      { title: "No time to return calls", description: "By the time you call back, the homeowner already booked someone else. Ringster qualifies leads in real time." },
    ],
    faqs: [
      { q: "Can Ringster handle emergency plumbing calls?", a: "Yes. Configure emergency keywords like 'burst pipe,' 'flooding,' or 'no water' to immediately transfer to your on-call team." },
      { q: "Will it know my service area?", a: "You provide your service area and Ringster tells callers whether you cover their location before booking." },
      { q: "Can it give plumbing estimates?", a: "Ringster shares pricing ranges you define, like 'drain cleaning starts at $150,' and captures details for a custom quote." },
      { q: "Does it work with my scheduling software?", a: "Ringster integrates with Google Calendar and can capture booking requests that sync with your workflow." },
    ],
    stats: [
      { value: "62%", label: "of plumbing calls go unanswered during jobs" },
      { value: "$250+", label: "average value of a missed plumbing lead" },
      { value: "3 min", label: "before a caller tries the next plumber" },
    ],
  },
  hvac: {
    slug: "hvac",
    name: "HVAC",
    plural: "HVAC contractors",
    headline: "Never Miss an HVAC Service Call Again",
    subheadline: "When a homeowner's AC breaks in July, they're calling every company until someone picks up. Make sure it's your AI receptionist.",
    cityHeadline: (city) => `AI Receptionist for HVAC Companies in ${city}`,
    cityIntro: (city, state) => `${city}, ${state} HVAC contractors face brutal seasonal demand. Ringster handles unlimited simultaneous calls, triages emergencies, and books service around the clock so no ${city} homeowner gets sent to voicemail.`,
    painPoints: [
      { title: "Peak season overwhelms your front desk", description: "Summer and winter surges flood your phone lines. Ringster handles unlimited simultaneous calls so every customer gets through." },
      { title: "Dispatchers can't keep up", description: "Your team is buried in scheduling while the phone keeps ringing. Ringster captures service requests and qualifies urgency automatically." },
      { title: "Losing after-hours maintenance contracts", description: "Property managers and commercial clients call outside business hours. Ringster answers 24/7 and captures contract inquiries." },
    ],
    faqs: [
      { q: "Can Ringster triage HVAC emergencies?", a: "Yes. Urgency rules trigger on keywords like 'no heat,' 'gas smell,' or 'system down' — emergencies get transferred immediately." },
      { q: "Can it handle seasonal call spikes?", a: "Ringster scales instantly. Whether you get 10 calls or 1,000 in a day, every one is answered on the first ring." },
      { q: "Will it capture equipment details?", a: "Yes. Ringster can ask about system type, age, last service date, and symptoms so your techs arrive prepared." },
      { q: "Does it work for commercial HVAC?", a: "Yes. Configure separate flows for residential and commercial callers with different routing and qualification rules." },
    ],
    stats: [
      { value: "78%", label: "of HVAC customers call the first company that answers" },
      { value: "$400+", label: "average revenue per HVAC service call" },
      { value: "40%", label: "of calls come outside business hours" },
    ],
  },
  electricians: {
    slug: "electricians",
    name: "Electrical",
    plural: "electricians",
    headline: "Your Electrical Business Deserves an AI That Answers Every Call",
    subheadline: "When a breaker trips or outlets stop working, homeowners want answers fast. Ringster picks up instantly and captures every lead.",
    cityHeadline: (city) => `AI Receptionist for Electricians in ${city}`,
    cityIntro: (city, state) => `Electricians in ${city}, ${state} lose bids to whoever answers first. Ringster picks up on the first ring, qualifies the job, and dispatches emergencies to your on-call electrician — day or night.`,
    painPoints: [
      { title: "Missing calls during installations", description: "You're wiring a panel and can't answer. Ringster captures the caller's issue, contact info, and urgency." },
      { title: "Emergency calls going to voicemail", description: "Power outages and electrical hazards can't wait. Ringster detects emergencies and transfers to your on-call electrician immediately." },
      { title: "Losing bids to faster responders", description: "Contractors who respond first win the job. Ringster qualifies leads in real time and sends details instantly." },
    ],
    faqs: [
      { q: "Can Ringster handle electrical emergencies?", a: "Yes. Keywords like 'sparking,' 'power out,' or 'burning smell' trigger immediate transfer to your emergency contact." },
      { q: "Will it explain my licensing and insurance?", a: "You provide your credentials and Ringster shares them with callers who ask, building trust before you speak to them." },
      { q: "Can it quote electrical work?", a: "Ringster shares price ranges you define — like 'panel upgrades start at $1,500' — and captures project details for custom quotes." },
      { q: "Does it handle both residential and commercial?", a: "Yes. Configure separate call flows for residential homeowners versus commercial property managers." },
    ],
    stats: [
      { value: "55%", label: "of electrical leads lost to unanswered calls" },
      { value: "$350+", label: "average revenue per electrical service call" },
      { value: "5 min", label: "window before a homeowner calls the next electrician" },
    ],
  },
  salons: {
    slug: "salons",
    name: "Salon",
    plural: "salons",
    headline: "Book More Appointments Without Interrupting Your Day",
    subheadline: "Your stylists are with clients. The phone rings. Ringster answers, books, and reschedules — so you never lose a booking to voicemail.",
    cityHeadline: (city) => `AI Receptionist for Salons in ${city}`,
    cityIntro: (city, state) => `Salons and spas in ${city}, ${state} lose appointments every day to unanswered calls. Ringster picks up while you're with clients, books directly into your calendar, and confirms appointments 24/7.`,
    painPoints: [
      { title: "Can't stop mid-service to answer", description: "You're mid-cut when the phone rings. Ringster picks up, books the appointment, and adds it to your calendar." },
      { title: "Reschedules eat your day", description: "Change requests, cancellations, and no-show follow-ups burn front-desk hours. Ringster handles them automatically." },
      { title: "After-hours bookings lost forever", description: "Clients book on their schedule, not yours. Ringster takes bookings evenings and weekends when you're closed." },
    ],
    faqs: [
      { q: "Can Ringster book directly into my calendar?", a: "Yes. Ringster integrates with Google Calendar and can respect service durations, buffer times, and stylist availability." },
      { q: "Does it know my services and prices?", a: "You configure your service menu and pricing. Ringster quotes correctly and books the right length appointment." },
      { q: "Can it handle rescheduling?", a: "Yes. Clients can call to change, cancel, or reschedule and Ringster updates the calendar automatically." },
      { q: "Will it transfer to me for special requests?", a: "Yes. Set rules to transfer complex color consults or VIP clients directly to you." },
    ],
    stats: [
      { value: "38%", label: "of salon calls happen while stylists are busy" },
      { value: "$85+", label: "average value of a lost salon booking" },
      { value: "24/7", label: "booking availability with Ringster" },
    ],
  },
  cleaning: {
    slug: "cleaning",
    name: "Cleaning",
    plural: "cleaning businesses",
    headline: "Book More Cleaning Jobs Without Being Chained to Your Phone",
    subheadline: "You're on a job. The phone rings. Ringster answers, quotes, and books — so you can focus on the work.",
    cityHeadline: (city) => `AI Receptionist for Cleaning Businesses in ${city}`,
    cityIntro: (city, state) => `Residential and commercial cleaners in ${city}, ${state} juggle jobs, quotes, and scheduling. Ringster answers every call, qualifies the space, and books recurring or one-time cleans directly into your calendar.`,
    painPoints: [
      { title: "Can't answer while cleaning", description: "You're mid-job. Ringster picks up, gets square footage and frequency, and books the estimate." },
      { title: "Quotes take forever", description: "Every quote call eats 15 minutes. Ringster gathers the details upfront so you quote in seconds, not sessions." },
      { title: "Losing recurring clients to competitors", description: "Prospects who don't hear back go elsewhere. Ringster responds instantly, day or night." },
    ],
    faqs: [
      { q: "Can Ringster quote cleaning jobs?", a: "Ringster asks the questions you specify (square footage, bedrooms, frequency) and shares your rate ranges, then captures the lead." },
      { q: "Does it handle recurring bookings?", a: "Yes. Ringster can book one-time deep cleans, weekly, bi-weekly, or monthly recurring service." },
      { q: "Will it handle commercial inquiries differently?", a: "Yes. Route commercial vs. residential calls to different flows with different qualifying questions." },
      { q: "Can clients reschedule through Ringster?", a: "Yes. Clients call to reschedule and Ringster updates your calendar automatically." },
    ],
    stats: [
      { value: "45%", label: "of cleaning inquiries never get a callback in time" },
      { value: "$120+", label: "average value of a one-time cleaning job" },
      { value: "5x", label: "lifetime value of a recurring cleaning client" },
    ],
  },
  "real-estate": {
    slug: "real-estate",
    name: "Real Estate",
    plural: "real estate agents",
    headline: "Never Miss a Hot Lead Again",
    subheadline: "Buyers call about listings when they see the sign — not when you're free. Ringster qualifies leads instantly so you close more deals.",
    cityHeadline: (city) => `AI Receptionist for Real Estate Agents in ${city}`,
    cityIntro: (city, state) => `Real estate agents in ${city}, ${state} work the phones between showings and closings. Ringster answers listing calls the moment they come in, qualifies buyers and sellers, and books showings on your calendar.`,
    painPoints: [
      { title: "Sign calls go unanswered", description: "Buyers drive by, call the sign, and hang up if nobody answers. Ringster picks up on the first ring." },
      { title: "Lead qualification eats hours", description: "You spend hours on prospects who aren't ready. Ringster qualifies budget, timeline, and financing before you get involved." },
      { title: "Showings get lost in phone tag", description: "By the time you call back, the buyer's toured with another agent. Ringster books showings directly into your calendar." },
    ],
    faqs: [
      { q: "Can Ringster qualify buyer leads?", a: "Yes. Configure Ringster to ask about pre-approval, timeline, budget, and area preferences — and only pass qualified leads to you." },
      { q: "Will it handle seller inquiries differently?", a: "Yes. Route seller lead calls to a separate flow that captures property details and books listing appointments." },
      { q: "Can it answer questions about specific listings?", a: "Ringster shares listing info you provide (price, beds, baths, features) and captures serious buyers for showings." },
      { q: "Does it integrate with my CRM?", a: "Ringster captures lead details and can push them via webhook to most real estate CRMs." },
    ],
    stats: [
      { value: "48%", label: "of real estate sign calls go to voicemail" },
      { value: "$8,000+", label: "average commission on a typical home sale" },
      { value: "78%", label: "of buyers work with the first agent who responds" },
    ],
  },
  "law-firms": {
    slug: "law-firms",
    name: "Law Firm",
    plural: "law firms",
    headline: "Never Lose a Client to a Missed Call",
    subheadline: "Prospective clients call in crisis. If you don't answer, they call the next firm. Ringster intakes every call professionally, 24/7.",
    cityHeadline: (city) => `AI Receptionist for Law Firms in ${city}`,
    cityIntro: (city, state) => `Attorneys in ${city}, ${state} lose retainer-worthy clients when calls go to voicemail. Ringster handles new-client intake with the professionalism your firm requires, screens for conflicts, and books consultations 24/7.`,
    painPoints: [
      { title: "Prospective clients won't leave voicemail", description: "People in legal trouble call, hang up if there's no answer, and call the next firm. Ringster answers on the first ring." },
      { title: "Intake takes 20 minutes per caller", description: "Basic intake questions eat associate time. Ringster gathers case type, dates, parties, and urgency before you're involved." },
      { title: "After-hours emergencies lost", description: "Arrests, injuries, and evictions don't happen 9-to-5. Ringster handles urgent intake overnight and weekends." },
    ],
    faqs: [
      { q: "Can Ringster do professional client intake?", a: "Yes. Configure the exact intake questions your firm requires — case type, parties, dates, jurisdiction, and urgency — and Ringster gathers them in a natural conversation." },
      { q: "Will it screen for conflicts?", a: "Ringster can ask for opposing party names during intake and flag them for your review before you take the case." },
      { q: "Is it confidential?", a: "Ringster does not create an attorney-client relationship and can include a disclaimer that no privilege attaches until you formally accept the case." },
      { q: "Can it book consultations?", a: "Yes. Qualified leads get consultations booked directly into your calendar with all intake details attached." },
    ],
    stats: [
      { value: "42%", label: "of legal callers hang up on voicemail" },
      { value: "$3,500+", label: "average value of a new client retainer" },
      { value: "35%", label: "of legal inquiries come after business hours" },
    ],
  },
  dentists: {
    slug: "dentists",
    name: "Dental",
    plural: "dental practices",
    headline: "Book More Patients Without Front-Desk Overload",
    subheadline: "Your front desk is swamped between check-ins and check-outs. Ringster handles overflow calls, books new patients, and confirms appointments.",
    cityHeadline: (city) => `AI Receptionist for Dentists in ${city}`,
    cityIntro: (city, state) => `Dental practices in ${city}, ${state} lose new patients to voicemail every day. Ringster answers overflow and after-hours calls, books cleanings and consults, and handles insurance questions so your front desk can focus on patients in the chair.`,
    painPoints: [
      { title: "Front desk overwhelmed at peak times", description: "Morning check-ins and afternoon check-outs block the phones. Ringster catches every overflow call." },
      { title: "New patient inquiries lost", description: "New patients shop around. If they can't book fast, they book elsewhere. Ringster schedules the first visit immediately." },
      { title: "Constant appointment confirmations", description: "Reminders, reschedules, and cancellations eat staff hours. Ringster automates the whole cycle." },
    ],
    faqs: [
      { q: "Can Ringster book new patient appointments?", a: "Yes. Ringster asks the intake questions you configure, checks insurance basics, and books the first appointment directly into your calendar." },
      { q: "Does it handle insurance questions?", a: "Ringster shares the insurance plans you accept and can gather insurance details for verification, without making binding coverage promises." },
      { q: "Can it handle emergencies?", a: "Yes. Emergency dental keywords like 'severe pain,' 'knocked out,' or 'swelling' trigger immediate transfer to your on-call dentist." },
      { q: "Will it work with my practice management software?", a: "Ringster integrates with Google Calendar and can push appointment details via webhook to most practice management systems." },
    ],
    stats: [
      { value: "34%", label: "of dental practice calls go unanswered at peak hours" },
      { value: "$650+", label: "average lifetime value of a new dental patient" },
      { value: "5 min", label: "before a new patient calls the next practice" },
    ],
  },
  "general-contractors": {
    slug: "general-contractors",
    name: "General Contracting",
    plural: "general contractors",
    headline: "Win More Bids by Answering Every Call",
    subheadline: "Homeowners call three contractors. The one who answers gets the bid. With Ringster, that's always you.",
    cityHeadline: (city) => `AI Receptionist for General Contractors in ${city}`,
    cityIntro: (city, state) => `Contractors in ${city}, ${state} lose bids to whoever answers first. Ringster picks up on the first ring, qualifies the project scope and budget, and books site visits — even when you're on a jobsite.`,
    painPoints: [
      { title: "Missing calls on the jobsite", description: "You can't answer with a saw running. Ringster picks up, captures project details, and texts you the lead." },
      { title: "Unqualified leads waste your time", description: "You drive across town for a $200 job. Ringster qualifies budget and scope so you only bid on projects worth your time." },
      { title: "Bid follow-ups fall through the cracks", description: "Homeowners want fast responses. Ringster follows up, answers questions, and moves the deal forward." },
    ],
    faqs: [
      { q: "Can Ringster qualify project size and budget?", a: "Yes. Ringster asks the scope questions you specify (project type, square footage, budget range, timeline) so you only bid on qualified work." },
      { q: "Will it handle subcontractor calls differently?", a: "Yes. Configure a separate flow for sub inquiries versus new homeowner leads." },
      { q: "Can it book site visits?", a: "Yes. Qualified leads get site visits booked into your calendar with project details attached." },
      { q: "Does it handle emergencies like storm damage?", a: "Yes. Emergency keywords trigger immediate callback so you can respond to storm and water damage jobs first." },
    ],
    stats: [
      { value: "58%", label: "of contractor bids are lost to slow response times" },
      { value: "$12,000+", label: "average value of a mid-size remodel bid" },
      { value: "3x", label: "close rate for contractors who respond in under 5 minutes" },
    ],
  },
  roofers: {
    slug: "roofers",
    name: "Roofing",
    plural: "roofers",
    headline: "Win Storm Jobs by Responding First",
    subheadline: "After a storm, homeowners call every roofer in town. The first to answer gets the inspection. Ringster answers instantly, 24/7.",
    cityHeadline: (city) => `AI Receptionist for Roofers in ${city}`,
    cityIntro: (city, state) => `Roofing companies in ${city}, ${state} compete for storm-damage jobs where speed decides the winner. Ringster answers immediately, qualifies the damage, and books inspections while your crew is still on the roof.`,
    painPoints: [
      { title: "Storm calls overwhelm your line", description: "After a hailstorm, calls spike 10x. Ringster handles unlimited simultaneous calls so no lead is lost." },
      { title: "Insurance callers need patient handling", description: "Homeowners are anxious and want answers. Ringster explains your process, insurance handling, and next steps calmly." },
      { title: "Roof inspections queue up", description: "You can't book fast enough. Ringster schedules inspections directly and captures storm-damage details." },
    ],
    faqs: [
      { q: "Can Ringster handle storm-damage inquiries?", a: "Yes. Configure Ringster to gather storm date, damage type, insurance carrier, and property size — and schedule inspections instantly." },
      { q: "Will it explain insurance claim assistance?", a: "You provide your claim-support process and Ringster explains it to homeowners, building trust before they book." },
      { q: "Can it book inspections?", a: "Yes. Qualified leads get roof inspections booked into your calendar with all damage details attached." },
      { q: "Does it handle commercial roofing separately?", a: "Yes. Route commercial property managers to a different flow with different qualifying questions and pricing." },
    ],
    stats: [
      { value: "72%", label: "of storm-damage callers book the first roofer who answers" },
      { value: "$9,500+", label: "average value of an insurance-covered roof replacement" },
      { value: "10x", label: "call volume spike after a hailstorm" },
    ],
  },
  landscapers: {
    slug: "landscapers",
    name: "Landscaping",
    plural: "landscapers",
    headline: "Book More Jobs Without Being on the Phone",
    subheadline: "You're on a mower or a design. Ringster answers the phone, qualifies the property, and books estimates — so you can keep working.",
    cityHeadline: (city) => `AI Receptionist for Landscapers in ${city}`,
    cityIntro: (city, state) => `Landscapers in ${city}, ${state} work outside all day. Ringster catches every call — lawn care, design, hardscaping, snow removal — qualifies the lot size and scope, and books estimates around your route.`,
    painPoints: [
      { title: "Can't answer with equipment running", description: "Your crew is mowing or grading. Ringster picks up, gathers property details, and books the estimate." },
      { title: "Seasonal call spikes overwhelm you", description: "Spring cleanup, fall leaves, first snow — demand triples overnight. Ringster scales instantly." },
      { title: "Quotes take forever", description: "Every estimate call runs 15 minutes. Ringster gathers lot size, services, and frequency upfront." },
    ],
    faqs: [
      { q: "Can Ringster quote landscaping jobs?", a: "Ringster gathers the details you specify (lot size, services, frequency) and shares rate ranges, then books the estimate." },
      { q: "Does it handle seasonal services?", a: "Yes. Configure separate flows for lawn care, snow removal, cleanup, or design — each with its own questions and pricing." },
      { q: "Will it handle commercial vs. residential differently?", a: "Yes. Commercial and residential callers get routed to different flows with different scope questions." },
      { q: "Can clients set up recurring service?", a: "Yes. Ringster books weekly, bi-weekly, or monthly recurring service directly into your calendar." },
    ],
    stats: [
      { value: "50%", label: "of landscaping calls happen while crews are in the field" },
      { value: "$180+", label: "average value of a one-time landscaping job" },
      { value: "8x", label: "lifetime value of a recurring maintenance contract" },
    ],
  },
  "med-spas": {
    slug: "med-spas",
    name: "Med Spa",
    plural: "med spas",
    headline: "Book More Treatments Without Interrupting Consults",
    subheadline: "Your team is in consultations and treatments. Ringster answers the phone, books consults, and handles pricing questions — 24/7.",
    cityHeadline: (city) => `AI Receptionist for Med Spas in ${city}`,
    cityIntro: (city, state) => `Med spas in ${city}, ${state} juggle consultations, treatments, and pricing questions. Ringster answers every call professionally, books consults directly into your calendar, and shares pricing so no lead goes cold.`,
    painPoints: [
      { title: "Consults can't be interrupted", description: "Your team is with a client. Ringster picks up, answers common questions, and books the consult." },
      { title: "Price shoppers eat staff time", description: "Callers want treatment prices before booking. Ringster shares your pricing ranges and captures the qualified ones." },
      { title: "After-hours inquiries lost", description: "Med spa clients research on their schedule, not yours. Ringster books evening and weekend inquiries." },
    ],
    faqs: [
      { q: "Can Ringster share treatment prices?", a: "Yes. Configure your pricing for Botox, filler, laser, and other treatments — Ringster shares ranges and captures qualified consult bookings." },
      { q: "Does it handle consultation booking?", a: "Yes. Ringster books consults directly into your calendar with the treatment interest and client contact details." },
      { q: "Will it explain treatment options?", a: "Ringster shares the treatment descriptions you provide and directs deeper questions to your provider consultation." },
      { q: "Can it handle follow-up and rebooking?", a: "Yes. Existing clients calling for follow-ups or maintenance appointments get booked automatically." },
    ],
    stats: [
      { value: "44%", label: "of med spa calls go unanswered during treatments" },
      { value: "$550+", label: "average value of a first Botox appointment" },
      { value: "4x", label: "lifetime value of a maintenance-schedule client" },
    ],
  },
};

export const industryList = Object.values(industries);
export const industryBySlug = (slug: string) => industries[slug];
