// CrimeAI legal-knowledge foundation — the SETTLED law a resident most needs
// in a police encounter, encoded with authoritative citations.
//
// Design principle: only put here what is stable and authoritative — the U.S.
// Constitution and long-standing Supreme Court holdings — plus a hand-verified
// launch-state (Florida) layer. Everything jurisdiction-specific and volatile
// (state statutes, county/city ordinances, recent changes) is NOT baked in;
// it is retrieved live from official government sources at answer time
// (lib/law/retrieve.ts), so CrimeAI cites CURRENT law and can tell active
// from repealed. Baked-in local law would be stale within weeks and dangerous
// for someone relying on it during a stop.
//
// Every entry carries `source` (an official/authoritative URL) and `asOf`.
// Add entries only with a .gov / court / LII citation.

export interface LawEntry {
  id: string;
  scope: "federal" | "state" | "local";
  jurisdiction: string;          // "US" | "FL" | "FL/Miami-Dade" …
  topic: string;                 // used for matching a question
  title: string;
  summary: string;               // plain-language, information NOT advice
  source: string;                // official citation URL
  asOf: string;                  // ISO date the entry was verified
  status: "active";              // baked-in entries are only ever active law
}

const D = "2026-08-15";

export const CONSTITUTION: LawEntry[] = [
  { id: "us-const-1", scope: "federal", jurisdiction: "US", topic: "speech religion press assembly petition first amendment", title: "First Amendment", status: "active", asOf: D,
    summary: "Protects freedom of religion, speech, press, peaceful assembly, and petitioning the government. Courts have consistently held it protects the right to record police officers performing duties in public, subject to reasonable time/place/manner limits.",
    source: "https://constitution.congress.gov/constitution/amendment-1/" },
  { id: "us-const-2", scope: "federal", jurisdiction: "US", topic: "firearms bear arms second amendment gun", title: "Second Amendment", status: "active", asOf: D,
    summary: "Protects the right to keep and bear arms. Federal, state, and local law regulate carry, purchase, and possession — always check the specific jurisdiction's current statute.",
    source: "https://constitution.congress.gov/constitution/amendment-2/" },
  { id: "us-const-4", scope: "federal", jurisdiction: "US", topic: "search seizure warrant probable cause traffic stop stop frisk phone car home fourth amendment", title: "Fourth Amendment", status: "active", asOf: D,
    summary: "Protects against unreasonable searches and seizures; warrants require probable cause. Practical core: you can decline to consent to a search (say clearly 'I do not consent to a search'); police generally need a warrant, consent, probable cause, or a recognized exception to search you, your car, your phone, or your home.",
    source: "https://constitution.congress.gov/constitution/amendment-4/" },
  { id: "us-const-5", scope: "federal", jurisdiction: "US", topic: "silence self incrimination miranda questioning fifth amendment due process", title: "Fifth Amendment", status: "active", asOf: D,
    summary: "Right against self-incrimination and to due process. You may remain silent; you generally must clearly say you are invoking it (e.g., 'I'm exercising my right to remain silent'). Silence alone can sometimes be used against you if not clearly invoked (Salinas v. Texas, 2013).",
    source: "https://constitution.congress.gov/constitution/amendment-5/" },
  { id: "us-const-6", scope: "federal", jurisdiction: "US", topic: "lawyer attorney counsel trial speedy sixth amendment", title: "Sixth Amendment", status: "active", asOf: D,
    summary: "Right to counsel, a speedy public trial by jury, and to confront witnesses. Once you clearly ask for a lawyer, police must stop custodial questioning (Edwards v. Arizona).",
    source: "https://constitution.congress.gov/constitution/amendment-6/" },
  { id: "us-const-8", scope: "federal", jurisdiction: "US", topic: "bail fines cruel unusual punishment eighth amendment", title: "Eighth Amendment", status: "active", asOf: D,
    summary: "Prohibits excessive bail, excessive fines, and cruel and unusual punishment.",
    source: "https://constitution.congress.gov/constitution/amendment-8/" },
  { id: "us-const-14", scope: "federal", jurisdiction: "US", topic: "equal protection due process discrimination state fourteenth amendment", title: "Fourteenth Amendment", status: "active", asOf: D,
    summary: "Guarantees due process and equal protection under state law; applies most Bill of Rights protections to state and local police, not just federal agents.",
    source: "https://constitution.congress.gov/constitution/amendment-14/" },
];

// Settled Supreme Court holdings that define what happens in a police encounter.
export const POLICE_ENCOUNTER_RIGHTS: LawEntry[] = [
  { id: "scotus-miranda", scope: "federal", jurisdiction: "US", topic: "miranda rights arrest custody questioning warning", title: "Miranda v. Arizona (1966)", status: "active", asOf: D,
    summary: "Before custodial interrogation, police must advise you of the right to remain silent and to an attorney. If you are NOT in custody, they don't have to read Miranda — anything you volunteer can still be used. Invoke clearly: 'I want a lawyer. I'm remaining silent.'",
    source: "https://supreme.justia.com/cases/federal/us/384/436/" },
  { id: "scotus-terry", scope: "federal", jurisdiction: "US", topic: "stop frisk pat down reasonable suspicion detained detention", title: "Terry v. Ohio (1968)", status: "active", asOf: D,
    summary: "Police may briefly stop you on reasonable suspicion of crime, and pat down outer clothing only if they reasonably believe you're armed. A frisk is not a full search. You may ask 'Am I being detained, or am I free to go?'",
    source: "https://supreme.justia.com/cases/federal/us/392/1/" },
  { id: "scotus-rodriguez", scope: "federal", jurisdiction: "US", topic: "traffic stop prolonged dog sniff how long detained", title: "Rodriguez v. United States (2015)", status: "active", asOf: D,
    summary: "A traffic stop can't be extended beyond the time needed for its purpose (ticket, license/registration check) without independent reasonable suspicion — e.g., waiting for a drug dog. You may ask if you're free to leave once the stop's business is done.",
    source: "https://supreme.justia.com/cases/federal/us/575/348/" },
  { id: "scotus-riley", scope: "federal", jurisdiction: "US", topic: "phone search cell phone unlock passcode arrest", title: "Riley v. California (2014)", status: "active", asOf: D,
    summary: "Police generally need a WARRANT to search the contents of your phone, even after an arrest. You are not required to unlock it or give a passcode; whether you can be compelled to use biometrics (face/fingerprint) is unsettled and varies by court.",
    source: "https://supreme.justia.com/cases/federal/us/573/373/" },
  { id: "scotus-mimms", scope: "federal", jurisdiction: "US", topic: "traffic stop step out of car exit vehicle order", title: "Pennsylvania v. Mimms (1977) / Maryland v. Wilson (1997)", status: "active", asOf: D,
    summary: "During a lawful traffic stop, officers may order the driver — and passengers — out of the vehicle. Comply, then assert rights verbally; don't physically resist.",
    source: "https://supreme.justia.com/cases/federal/us/434/106/" },
  { id: "scotus-heien", scope: "federal", jurisdiction: "US", topic: "traffic stop reason pulled over mistake of law", title: "Heien v. North Carolina (2014)", status: "active", asOf: D,
    summary: "A stop based on an officer's reasonable mistake of law can still be valid. Practical takeaway: argue legality later, in court — not on the roadside.",
    source: "https://supreme.justia.com/cases/federal/us/574/54/" },
  { id: "scotus-glik", scope: "federal", jurisdiction: "US", topic: "record police film video camera public first amendment", title: "Right to record police (Glik v. Cunniffe & circuit consensus)", status: "active", asOf: D,
    summary: "Federal appeals courts broadly recognize a First Amendment right to record police in public, as long as you don't interfere. Officers generally may not seize or delete your recording without a warrant. Some states' wiretap laws add rules for audio — check the state entry.",
    source: "https://www.aclu.org/know-your-rights/stopped-by-police" },
  { id: "scotus-florence-idlaws", scope: "federal", jurisdiction: "US", topic: "show id identification name refuse identify", title: "Hiibel v. Sixth Judicial District Court (2004)", status: "active", asOf: D,
    summary: "In states with 'stop and identify' laws, you can be required to give your NAME during a lawful Terry stop; you generally are not required to answer other questions. Whether you must show a physical ID (outside driving) depends on state law — check the state entry.",
    source: "https://supreme.justia.com/cases/federal/us/542/177/" },
];

// Launch-state layer — Florida. Hand-verified against official sources; keep
// short and cite. Volatile detail (penalties, recent amendments) is retrieved
// live from flsenate.gov / leg.state.fl.us at answer time.
export const FLORIDA: LawEntry[] = [
  { id: "fl-901-151", scope: "state", jurisdiction: "FL", topic: "stop frisk detained florida identify name terry stop", title: "Florida Stop and Frisk Law — Fla. Stat. § 901.151", status: "active", asOf: D,
    summary: "Florida allows officers to temporarily detain a person on reasonable suspicion of a crime and pat down for weapons if they reasonably believe the person is armed. Florida does NOT have a general stop-and-identify statute for pedestrians, but you must present a valid license when lawfully stopped while driving (§ 322.15).",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0900-0999/0901/Sections/0901.151.html" },
  { id: "fl-322-15", scope: "state", jurisdiction: "FL", topic: "traffic stop license registration insurance driving pulled over florida", title: "Driver must show license — Fla. Stat. § 322.15", status: "active", asOf: D,
    summary: "When lawfully stopped while driving in Florida, you must have and present your driver license on demand; registration and proof of insurance are also required (§ 320.0605, § 316.646). Passengers are not required to identify unless lawfully detained on their own suspicion.",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0322/Sections/0322.15.html" },
  { id: "fl-934-recording", scope: "state", jurisdiction: "FL", topic: "record police florida wiretap two party consent audio video film", title: "Recording & Florida's two-party consent law — Fla. Stat. § 934.03", status: "active", asOf: D,
    summary: "Florida is an all-party-consent state for PRIVATE conversations, but Florida courts hold police performing duties in public have no reasonable expectation of privacy — recording them openly in public is lawful (State v. Smith, and federal Glik line). Do not secretly record private conversations, and don't interfere with the officer.",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0900-0999/0934/Sections/0934.03.html" },
  { id: "fl-776-syg", scope: "state", jurisdiction: "FL", topic: "self defense stand your ground castle doctrine deadly force florida", title: "Florida Justifiable Use of Force ('Stand Your Ground') — Fla. Stat. ch. 776", status: "active", asOf: D,
    summary: "Florida law (§ 776.012, § 776.013) provides no duty to retreat before using force, including deadly force, if you reasonably believe it's necessary to prevent imminent death, great bodily harm, or a forcible felony, in a place you have a right to be. This is a fact-heavy legal defense — it does not make any use of force automatically lawful.",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0776/0776.html" },
  { id: "fl-843-02", scope: "state", jurisdiction: "FL", topic: "resisting officer without violence obstruction florida", title: "Resisting officer without violence — Fla. Stat. § 843.02", status: "active", asOf: D,
    summary: "It is a misdemeanor in Florida to knowingly resist, obstruct, or oppose an officer engaged in a lawful duty even without violence — this is why asserting rights VERBALLY while physically complying matters. Argue lawfulness later, in court.",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0843/Sections/0843.02.html" },
  { id: "fl-790-carry", scope: "state", jurisdiction: "FL", topic: "concealed carry gun permitless carry firearm florida car", title: "Florida permitless concealed carry — Fla. Stat. § 790.01 (2023)", status: "active", asOf: D,
    summary: "Since July 1, 2023, Florida allows eligible adults to carry a concealed firearm without a permit (HB 543); you must still meet the eligibility rules and carry ID, and prohibited-places rules and federal law still apply. Open carry remains generally prohibited. If asked by an officer whether you're armed, answering truthfully and keeping hands visible is the widely recommended practice.",
    source: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0790/Sections/0790.01.html" },
];

export const ALL_KNOWLEDGE: LawEntry[] = [...CONSTITUTION, ...POLICE_ENCOUNTER_RIGHTS, ...FLORIDA];

// ── matching ────────────────────────────────────────────────────────
const STOP = new Set(["the","a","an","and","or","of","to","in","on","for","is","are","my","me","i","do","can","what","if","when","get","got","by","with","at","it","this","that","be","was","they","them","he","she","his","her","you","your","about","how"]);
function terms(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// Rank baked-in entries against a question + user's state; return the best few.
export function matchKnowledge(question: string, state?: string, limit = 5): LawEntry[] {
  const q = terms(question);
  if (!q.length) return [];
  const st = (state || "").toUpperCase();
  const scored = ALL_KNOWLEDGE.map((e) => {
    const hay = new Set(terms(e.topic + " " + e.title));
    let score = 0;
    for (const w of q) if (hay.has(w)) score += 2;
    // partial stems (e.g. "recording" ~ "record")
    for (const w of q) for (const h of hay) if (h.length > 4 && (w.startsWith(h) || h.startsWith(w))) { score += 1; break; }
    if (e.scope === "state" && e.jurisdiction !== st) score = 0; // never surface another state's law
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}

// Is this a legal / rights / police-encounter question at all?
const LEGAL_SIGNALS = /\b(law|laws|legal|illegal|right|rights|police|cop|cops|officer|pulled over|traffic stop|arrest|arrested|detain|detained|search|warrant|miranda|lawyer|attorney|court|statute|ordinance|constitution|amendment|record(ing)? (the )?police|stand your ground|self.?defen[cs]e|concealed|carry|firearm|gun law|curfew|trespass|ticket|citation|dui|dwi|probable cause|consent|frisk|id\b|identif)/i;
export function looksLegal(question: string): boolean {
  return LEGAL_SIGNALS.test(question);
}
