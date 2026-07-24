// Maps raw police/agency incident descriptions onto the CrimeAI
// taxonomy (lib/categories.ts). Keyword-based on purpose: every agency
// labels offenses differently ("BURG-RESIDENCE", "Larceny from Auto",
// "AGG ASSLT"), and keywords survive all of them. First match wins —
// order is most-specific → least.
const RULES: { cat: string; sev: number; re: RegExp }[] = [
  { cat: "domestic", sev: 5, re: /DOMESTIC|FAMILY VIOL|INTIMATE PARTNER|DATING VIOL/i },
  { cat: "sexual", sev: 5, re: /SEX|RAPE|MOLEST|LEWD|INDECEN|VOYEUR|STALK|HARASS/i },
  { cat: "vehicle", sev: 3, re: /VEH|AUTO|CAR ?JACK|CARJACK|MOTOR|BIKE|BICYCLE|SCOOTER|GRAND THEFT AUTO|GTA/i },
  { cat: "burglary", sev: 4, re: /BURGL|BREAK(ING)? ?(AND|&)? ?ENTER|B ?& ?E|HOME INVASION|RESIDENTIAL THEFT|PORCH|PACKAGE/i },
  { cat: "identity", sev: 3, re: /IDENTITY|FRAUD|FORGERY|COUNTERFEIT|CREDIT CARD|EMBEZZLE|SWINDLE|CON GAME/i },
  { cat: "cyber", sev: 2, re: /CYBER|COMPUTER|ONLINE|INTERNET|PHISH|HACK|SCAM/i },
  { cat: "violent", sev: 5, re: /HOMICIDE|MURDER|MANSLAUGHTER|SHOOT|SHOTS|FIREARM|GUN|WEAPON|ARMED|ROBBERY|ASSAULT|BATTERY|KIDNAP|ABDUCT|CARNAL/i },
  { cat: "burglary", sev: 3, re: /THEFT|LARCENY|STOLEN|SHOPLIFT/i }, // generic theft after vehicle/burglary specifics
];

export function categorize(rawType: string): { category: string; severity: number } {
  for (const r of RULES) if (r.re.test(rawType)) return { category: r.cat, severity: r.sev };
  return { category: "other", severity: 1 };
}

/** Shape every adapter must return — mirrors the Incident schema. */
export interface RawIncident {
  externalId: string;    // stable id from the source (for idempotent upserts)
  type: string;          // the source's own offense label (kept verbatim)
  lat: number;
  lon: number;
  occurredAt: string;    // ISO
  reportedAt?: string;   // ISO
  neighborhood?: string;
  block?: string;
  verified?: boolean;
  severityOverride?: number;
  categoryOverride?: string;
}
