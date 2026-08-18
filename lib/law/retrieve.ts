// Live legal retrieval from OFFICIAL government sources.
//
// For jurisdiction-specific law (state statutes, county/city ordinances,
// recent changes) CrimeAI does not rely on memory — it searches official
// sources at answer time and cites what it finds. This is what makes
// "active vs no longer active" honest: currency is checked per answer against
// the publishing body, not assumed from training data.
//
// Sources are allow-listed. Anything not on the list is dropped — no blogs,
// no forums, no law-firm marketing pages.

import { gateway } from "@/lib/ai/gateway";
import type { SearchHit } from "@/lib/ai/providers";

// Official / authoritative publishers of primary law.
export const OFFICIAL_LAW_DOMAINS = [
  // federal
  "congress.gov", "constitution.congress.gov", "govinfo.gov", "supremecourt.gov",
  "law.cornell.edu",          // Cornell LII — the standard mirror of USC/CFR/SCOTUS
  "supreme.justia.com",       // full-text SCOTUS opinions
  "uscourts.gov", "justice.gov", "ecfr.gov", "federalregister.gov",
  // Florida (launch state)
  "leg.state.fl.us", "flsenate.gov", "myfloridahouse.gov", "flcourts.gov", "myfloridalegal.com",
  "flhsmv.gov", "fdle.state.fl.us",
  // county / city codes (official code publishers used by nearly all FL localities)
  "library.municode.com", "municode.com", "codelibrary.amlegal.com", "ecode360.com",
  "miamidade.gov", "broward.org", "pbcgov.org", "miamigov.com",
  // civil-rights guidance (authoritative, non-commercial)
  "aclu.org",
];

// Repeal / inactive markers publishers use. If a hit's title/snippet shows one,
// we tag it so the model can say "this was repealed" instead of citing it as live.
const INACTIVE_RE = /\b(repealed|rescinded|superseded|expired|struck down|held unconstitutional|no longer in effect|sunset(ted)?|vacated|overturned|abrogated|invalidated)\b/i;
const HISTORIC_RE = /\b(19[0-9]{2}|20[01][0-9]) (session|version|edition|statutes)\b|\barchive[sd]?\b|\bhistorical\b/i;

export interface LawHit extends SearchHit {
  domain: string;
  level: "federal" | "state" | "local" | "guidance";
  status: "active" | "inactive-signal" | "historic";
}

const FEDERAL = ["congress.gov", "constitution.congress.gov", "govinfo.gov", "supremecourt.gov", "law.cornell.edu", "supreme.justia.com", "uscourts.gov", "justice.gov", "ecfr.gov", "federalregister.gov"];
const LOCAL = ["library.municode.com", "municode.com", "codelibrary.amlegal.com", "ecode360.com", "miamidade.gov", "broward.org", "pbcgov.org", "miamigov.com"];

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function levelOf(domain: string): LawHit["level"] {
  if (domain === "aclu.org") return "guidance";
  if (FEDERAL.some((d) => domain === d || domain.endsWith("." + d))) return "federal";
  if (LOCAL.some((d) => domain === d || domain.endsWith("." + d))) return "local";
  return "state";
}
function isOfficial(domain: string): boolean {
  return OFFICIAL_LAW_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

// Build targeted queries: one per level so federal, state, and local law each
// get a shot, all restricted to official sites.
function siteClause(domains: string[]): string {
  return "(" + domains.map((d) => `site:${d}`).join(" OR ") + ")";
}

export interface Jurisdiction { state?: string; county?: string; city?: string }

export async function retrieveLaw(question: string, j: Jurisdiction, perLevel = 2): Promise<LawHit[]> {
  const s = gateway.search();
  if (!s.configured) return [];
  const st = (j.state || "").trim();
  const stateName = st === "FL" ? "Florida" : st;
  const localName = [j.city, j.county].filter(Boolean).join(" ");

  const queries: { q: string; level: LawHit["level"] }[] = [
    { q: `${question} ${siteClause(FEDERAL)}`, level: "federal" },
  ];
  if (stateName) {
    const stateDomains = st === "FL" ? ["leg.state.fl.us", "flsenate.gov", "myfloridahouse.gov", "flcourts.gov", "myfloridalegal.com", "flhsmv.gov"] : ["law.cornell.edu"];
    queries.push({ q: `${stateName} statute ${question} ${siteClause(stateDomains)}`, level: "state" });
  }
  if (localName) {
    queries.push({ q: `${localName} ${stateName} ordinance code ${question} ${siteClause(LOCAL)}`, level: "local" });
  }

  const results = await Promise.all(queries.map(async ({ q, level }) => {
    try {
      const hits = await s.search(q, { limit: perLevel + 2 });
      return hits
        .map((h): LawHit | null => {
          const domain = domainOf(h.url);
          if (!isOfficial(domain)) return null;
          const text = `${h.title} ${h.snippet || ""}`;
          const status: LawHit["status"] = INACTIVE_RE.test(text) ? "inactive-signal" : HISTORIC_RE.test(text) ? "historic" : "active";
          return { ...h, domain, level: levelOf(domain) || level, status };
        })
        .filter((x): x is LawHit => !!x)
        .slice(0, perLevel);
    } catch { return []; }
  }));

  // dedupe by url, keep level ordering federal → state → local
  const seen = new Set<string>();
  return results.flat().filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)));
}

// Render retrieved law as a context block for the model.
export function formatLawHits(hits: LawHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const flag = h.status === "inactive-signal" ? " [SOURCE INDICATES REPEALED/INACTIVE — do not present as current law]"
      : h.status === "historic" ? " [HISTORIC VERSION — verify current text]" : "";
    return `${i + 1}. [${h.level.toUpperCase()}] ${h.title}${flag}\n   ${h.snippet || ""}\n   Source: ${h.url}`;
  });
  return lines.join("\n");
}
