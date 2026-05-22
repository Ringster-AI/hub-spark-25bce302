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
