export const INDUSTRIES = [
  { key: "plumbing", label: "Plumbing" },
  { key: "hvac", label: "HVAC" },
  { key: "electrician", label: "Electrician" },
  { key: "clinic", label: "Clinic / Wellness" },
  { key: "agency", label: "Agency" },
  { key: "realestate", label: "Real Estate" },
  { key: "other", label: "Other" },
] as const;

export const USE_CASES = [
  { key: "inbound", label: "Answer inbound calls" },
  { key: "outbound", label: "Run outbound campaigns" },
  { key: "both", label: "Both inbound & outbound" },
] as const;

export const industryAgentName = (industry?: string) => {
  switch (industry) {
    case "plumbing": return "Jordan";
    case "hvac": return "Sarah";
    case "electrician": return "Alex";
    case "clinic": return "Riley";
    case "agency": return "Morgan";
    case "realestate": return "Avery";
    default: return "Ringo";
  }
};

export const industryGreeting = (industry: string | undefined, business = "our team") => {
  const name = industryAgentName(industry);
  const base = `Hi, this is ${name} from ${business}.`;
  switch (industry) {
    case "plumbing":
    case "hvac":
    case "electrician":
      return `${base} How can I help — is this about a new job, scheduling, or an emergency?`;
    case "clinic":
      return `${base} Are you calling to book an appointment or about an existing one?`;
    case "agency":
      return `${base} How can I direct your call today?`;
    case "realestate":
      return `${base} Are you calling about a listing, a showing, or something else?`;
    default:
      return `${base} How can I help you today?`;
  }
};

export type IndustryTemplate = {
  voice: "warm" | "professional" | "friendly";
  tone: number;
  faqs: { q: string; a: string }[];
  scriptOutline: string[];
  tips: string[];
};

const fallback: IndustryTemplate = {
  voice: "warm",
  tone: 50,
  faqs: [
    { q: "What are your hours?", a: "We're available Monday through Friday, 9am to 6pm." },
    { q: "How can I reach a human?", a: "I can take a message and have someone call you back shortly." },
  ],
  scriptOutline: [
    "Greet the caller warmly and introduce yourself",
    "Ask what they need help with",
    "Capture name and best callback number",
    "Confirm next steps before ending the call",
  ],
  tips: [
    "Add 3–5 FAQ answers so your agent can resolve calls without escalation.",
    "Connect a calendar so bookings happen automatically.",
  ],
};

export const industryTemplate = (industry?: string): IndustryTemplate => {
  switch (industry) {
    case "plumbing":
    case "hvac":
    case "electrician":
      return {
        voice: "warm",
        tone: 55,
        faqs: [
          { q: "Do you handle emergencies?", a: "Yes — we offer 24/7 emergency dispatch. I can route you to an on-call tech right now." },
          { q: "What's your service area?", a: "We serve the greater metro area within a 30-mile radius." },
          { q: "Do you provide free estimates?", a: "Yes, in-home estimates are free for jobs over $300." },
        ],
        scriptOutline: [
          "Greet, then ask: new job, existing job, or emergency?",
          "If emergency → capture address, issue severity, and dispatch",
          "If new job → collect name, address, issue, preferred time window",
          "Confirm appointment + send SMS confirmation",
        ],
        tips: [
          "Mark emergency keywords (leak, no heat, sparking) for instant escalation.",
          "Sync your job calendar so the agent only books real availability.",
        ],
      };
    case "clinic":
      return {
        voice: "professional",
        tone: 35,
        faqs: [
          { q: "Do you accept my insurance?", a: "We accept most major PPO plans. I can take your insurer name and have our team verify coverage." },
          { q: "How do I cancel an appointment?", a: "I can cancel or reschedule for you right now — what's the appointment date?" },
          { q: "Where are you located?", a: "We're at our main clinic — I can text you the address and directions." },
        ],
        scriptOutline: [
          "Greet warmly and identify patient (new vs. existing)",
          "Determine reason: booking, reschedule, billing, or clinical",
          "For bookings → match service type to available slots",
          "Confirm details and send appointment summary",
        ],
        tips: [
          "Keep HIPAA in mind — never confirm diagnoses over the phone.",
          "Use calendar-based booking to avoid double-booked slots.",
        ],
      };
    case "agency":
      return {
        voice: "professional",
        tone: 45,
        faqs: [
          { q: "Do you take new clients?", a: "Yes — I can book a 20-minute discovery call with our team." },
          { q: "What services do you offer?", a: "We help with strategy, creative, and growth. I can send our deck." },
          { q: "Can I speak with the founder?", a: "Of course — let me grab your details and have them reach out today." },
        ],
        scriptOutline: [
          "Greet, qualify caller (prospect / client / press / vendor)",
          "Route prospects to discovery booking flow",
          "Route existing clients to their account lead",
          "Capture message + next-step commitment",
        ],
        tips: [
          "Pre-qualify leads with 2 questions before booking discovery calls.",
          "Auto-send a calendar invite + recap email after each booking.",
        ],
      };
    case "realestate":
      return {
        voice: "friendly",
        tone: 60,
        faqs: [
          { q: "Is this property still available?", a: "Let me check — what's the listing address or MLS number?" },
          { q: "Can I schedule a showing?", a: "Absolutely — what days and times work best this week?" },
          { q: "What's the asking price?", a: "I'll pull that up for you — one moment." },
        ],
        scriptOutline: [
          "Greet, ask listing of interest",
          "Capture buyer type (cash / financed / first-time)",
          "Book showing on agent calendar",
          "Send listing details + showing confirmation",
        ],
        tips: [
          "Tie listings to your MLS so the agent can answer specifics.",
          "Use SMS follow-ups to keep buyers warm between showings.",
        ],
      };
    default:
      return fallback;
  }
};
