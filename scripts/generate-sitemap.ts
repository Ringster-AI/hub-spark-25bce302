// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";
import { industries } from "../src/data/programmatic/industries";
import { cities } from "../src/data/programmatic/cities";

const BASE_URL = "https://getringster.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/ai-receptionist", changefreq: "weekly", priority: "0.9" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
  { path: "/pricing", changefreq: "weekly", priority: "0.9" },
  { path: "/faq", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.5" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/ebook", changefreq: "monthly", priority: "0.6" },
  { path: "/offer", changefreq: "monthly", priority: "0.6" },
  { path: "/roi-calculator", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/login", changefreq: "yearly", priority: "0.3" },
  { path: "/signup", changefreq: "monthly", priority: "0.7" },
];

// Industry hubs — one per industry (12 total, including the 3 hand-crafted plumbers/hvac/electricians pages).
const industryHubEntries: SitemapEntry[] = Object.values(industries).map((i) => ({
  path: `/ai-receptionist-for-${i.slug}`,
  changefreq: "monthly",
  priority: "0.8",
}));

// Programmatic industry x city pages — 12 industries x 100 cities = 1,200 entries.
const industryCityEntries: SitemapEntry[] = Object.values(industries).flatMap((i) =>
  cities.map((c) => ({
    path: `/ai-receptionist-for-${i.slug}/${c.slug}`,
    changefreq: "monthly" as const,
    priority: "0.6",
  })),
);

const blogSlugs: { slug: string; lastmod: string }[] = [
  { slug: "5-signs-your-business-needs-an-ai-phone-assistant-and-how-to-set-one-up-today", lastmod: "2025-03-10" },
  { slug: "AI-Call-Handling", lastmod: "2025-03-10" },
  { slug: "best-ai-scheduling-assistants", lastmod: "2026-05-16" },
  { slug: "cold-leads-ai-phone-assistant", lastmod: "2025-05-15" },
  { slug: "cold-leads-the-value-of-solving-missed-calls", lastmod: "2025-05-15" },
  { slug: "cold-leads-who-needs-an-ai-phone-assistant", lastmod: "2025-05-21" },
  { slug: "cold-leads-why-missed-calls-could-be-costing-you-more-than-you-think", lastmod: "2025-05-18" },
  { slug: "Feeling-overwhelmed-managing-your-small-business-and-missing-calls", lastmod: "2025-05-04" },
  { slug: "how-ai-agents-are-transforming-businesses-across-industries", lastmod: "2025-03-12" },
  { slug: "how-ai-assistants-solve-missed-business-calls", lastmod: "2025-05-06" },
  { slug: "how-ai-can-help-you-catch-every-call", lastmod: "2025-09-20" },
  { slug: "how-ai-can-keep-your-bakery-running-24-7", lastmod: "2025-05-05" },
  { slug: "how-ai-can-save-your-business-from-missed-calls", lastmod: "2025-05-05" },
  { slug: "how-ai-can-solve-missed-business-calls", lastmod: "2025-05-19" },
  { slug: "how-ai-phone-assistants-can-save-your-business", lastmod: "2025-05-14" },
  { slug: "how-businesses-can-utilize-ai-phone-assistants", lastmod: "2025-05-07" },
  { slug: "how-ringster-can-stop-missed-calls", lastmod: "2026-01-16" },
  { slug: "how-ringster-helps-small-businesses-avoid-missed-calls", lastmod: "2025-05-15" },
  { slug: "how-ringster-reduces-missed-business-calls", lastmod: "2025-05-06" },
  { slug: "how-ringster-revolves-missed-calls-for-small-businesses", lastmod: "2025-05-05" },
  { slug: "how-to-prevent-missed-calls-with-ai-assistance", lastmod: "2025-05-07" },
  { slug: "juggling-responsibilities-with-ringster-ai-phone-assistant", lastmod: "2025-05-05" },
  { slug: "missed-business-calls-turned-opportunities", lastmod: "2025-08-20" },
  { slug: "missing-calls-are-costing-you-business", lastmod: "2025-05-05" },
  { slug: "never-miss-a-call-again", lastmod: "2026-03-08" },
  { slug: "never-miss-another-call", lastmod: "2025-05-05" },
  { slug: "ringster-ai-call-handling-2025", lastmod: "2025-05-05" },
  { slug: "ringster-ai-call-handling-for-small-businesses", lastmod: "2025-05-04" },
  { slug: "solving-missed-calls-for-businesses", lastmod: "2025-05-05" },
  { slug: "solving-missed-calls-with-ai-phone-assistant", lastmod: "2025-05-14" },
  { slug: "the-ai-receptionist-you-didnt-know-you-needed", lastmod: "2025-05-05" },
  { slug: "the-hidden-cost-of-hiring-vs-the-ai-powered-future-of-call-handling", lastmod: "2025-03-10" },
  { slug: "the-missed-call-toll-of-small-businesses", lastmod: "2025-05-09" },
  { slug: "the-secret-to-never-missing-a-customer-again", lastmod: "2025-05-05" },
  { slug: "time-is-money-don-t-lose-another-minute", lastmod: "2025-03-10" },
  { slug: "transforming-small-business-calls", lastmod: "2025-05-19" },
  { slug: "turning-cold-leads-into-happy-customers-with-ringster", lastmod: "2025-05-14" },
  { slug: "unlocking-leads-missed-calls", lastmod: "2025-05-05" },
  { slug: "walking-the-tightrope-of-cold-leads", lastmod: "2025-05-15" },
  { slug: "why-ringster-is-the-perfect-ai-call-solution-for-your-business", lastmod: "2025-03-10" },
  { slug: "why-youre-missing-business-calls-and-how-to-fix-it", lastmod: "2025-05-15" },
  { slug: "why-you-should-never-miss-a-call-again", lastmod: "2025-05-06" },
];

const entries: SitemapEntry[] = [
  ...staticEntries,
  ...industryHubEntries,
  ...industryCityEntries,
  ...blogSlugs.map((b) => ({
    path: `/blog/${b.slug}`,
    lastmod: b.lastmod,
    changefreq: "monthly" as const,
    priority: "0.7",
  })),
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
