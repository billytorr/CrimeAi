// Know-your-rights SITUATIONS — the guided conversation flows.
//
// Instead of a static page, each situation starts a real conversation: CrimeAI
// opens with the one thing that matters most right now, then asks short,
// targeted questions to learn the specifics (jurisdiction, what stage they're
// at, what's been said/asked) BEFORE giving grounded, cited guidance. This is
// what makes CrimeAI an assistant rather than a pamphlet — the same flow runs
// in text and in voice mode.
//
// `intake` = the facts CrimeAI should try to learn (one or two questions at a
// time, never a form). `firstMove` = what to say immediately, before any
// question, because the person may have seconds. Every flow rides on the
// LEGAL-RIGHTS MODE guardrails in lib/law/index.ts (information not advice,
// jurisdiction, citations, comply physically / assert verbally, 911).

export interface Situation {
  id: string;
  label: string;          // pill text
  emoji: string;
  opener: string;         // the user's message that starts the flow (goes in the thread)
  firstMove: string;      // what CrimeAI must lead with, right now
  intake: string[];       // facts to gather, in priority order
  focus: string;          // the law/rights center of gravity for this flow
  police?: boolean;       // true = a law-enforcement encounter flow (lives under + → Know Your Rights)
}

export const SITUATIONS: Situation[] = [
  {
    id: "pulled_over", police: true, label: "Pulled over", emoji: "🚔",
    opener: "I'm being pulled over / just got pulled over.",
    firstMove: "Safety first, in one breath: pull over safely, engine off, interior light on if dark, hands on the wheel, tell them before you reach for anything. Then ask what's happening.",
    intake: [
      "Is this happening RIGHT NOW (officer approaching) or already over? — pace everything to that.",
      "What state/city are you in? (default to their profile location; confirm if it matters)",
      "Are you the driver or a passenger?",
      "What did the officer say the reason was, and what have they asked for so far (license? to step out? to search? questions)?",
      "Is there anything in the car they're asking about, or anything you're worried about? (don't demand details — let them share)",
    ],
    focus: "4th Amendment; Rodriguez v. U.S. (stop can't be prolonged); Mimms/Wilson (ordered out = comply); state license-on-demand rule; refusing consent to search verbally; passengers' non-ID rights.",
  },
  {
    id: "stopped_street", police: true, label: "Stopped on the street", emoji: "🚶",
    opener: "A police officer stopped me on the street / is questioning me.",
    firstMove: "Stay calm, hands visible, don't walk away yet. The first question to ask them, politely: 'Am I being detained, or am I free to go?'",
    intake: [
      "Is this happening right now?",
      "What state/city? (stop-and-identify rules differ by state)",
      "Did they say why they stopped you, or ask for ID or your name?",
      "Have they patted you down or asked to search you or your bag?",
      "Are you being told you can't leave?",
    ],
    focus: "Terry v. Ohio (reasonable suspicion, frisk ≠ search); Hiibel + the state's stop-and-ID rule; refusing consent to search; the detained-or-free question; walking away calmly if free.",
  },
  {
    id: "police_at_door", police: true, label: "Police at my door", emoji: "🚪",
    opener: "Police are at my door.",
    firstMove: "You don't have to open the door. Talk through it, or step outside and pull it closed behind you. Ask if they have a warrant.",
    intake: [
      "Are they there right now?",
      "Did they say why they're there (looking for someone? a call? a welfare check)?",
      "Have they shown a warrant? If so, is it an arrest warrant or a search warrant, and what does it say?",
      "Is anyone inside in danger, or is anyone else home?",
      "What state/city?",
    ],
    focus: "4th Amendment; Payton v. New York (need warrant/consent/exigency to enter); reading a warrant's scope; refusing consent verbally; not obstructing; welfare-check nuance.",
  },
  {
    id: "recording", police: true, label: "Recording police", emoji: "🎥",
    opener: "I want to record the police / I'm recording and they're telling me to stop.",
    firstMove: "You generally have a First Amendment right to record police doing their job in public. Stand back, don't interfere, and say calmly: 'I'm recording. I'm not interfering.'",
    intake: [
      "Where are you — public place, your property, or private property?",
      "What state? (audio consent laws vary; the state's rule matters)",
      "Are they ordering you to stop, move back, or hand over the phone?",
      "Are you the subject of the stop, or a bystander?",
    ],
    focus: "1st Amendment / Glik line; the state's recording/wiretap statute (FL two-party = private convos only); don't interfere; phone needs a warrant (Riley); don't unlock.",
  },
  {
    id: "arrested", police: true, label: "Being arrested", emoji: "⚖️",
    opener: "I'm being arrested / I was just arrested.",
    firstMove: "Do not resist, even if it feels wrong — resisting is its own charge; fight it in court, not on the street. Say clearly: 'I'm remaining silent. I want a lawyer.' Then stop talking.",
    intake: [
      "Is this happening now, or are you calling from after (released / bonded out / at the station)?",
      "What are they saying the charge is?",
      "Have they questioned you, and have you said anything? (no judgment — it matters for what to do next)",
      "Do you have a lawyer, or someone to call? Do you know your first court date?",
      "What state/county? (bail/first-appearance rules differ)",
    ],
    focus: "5th & 6th Amendments; Miranda (custodial questioning); Edwards (asked for lawyer → questioning stops); Riley (phone warrant); phone call; public defender at first appearance; the state's resisting statute; write everything down (names, badges, witnesses).",
  },
  {
    id: "know_rights", label: "What are my rights?", emoji: "📜",
    opener: "I want to understand my rights with the police and the law where I live.",
    firstMove: "Happy to walk you through it — this is exactly what I'm here for. Let's start with what's on your mind.",
    intake: [
      "Is there a specific situation you're thinking about (a stop, a search, recording, an arrest, self-defense, carrying), or general knowledge?",
      "What state/city do you want this for? (default to their profile location)",
      "Anything that happened recently that made you want to know?",
    ],
    focus: "The Constitution/Bill of Rights, the settled police-encounter cases, and the user's state/local law via LAW CONTEXT — teach, don't dump; ask what they want to go deeper on.",
  },
];

export const situationById = (id: string) => SITUATIONS.find((s) => s.id === id);
export const POLICE_SITUATIONS = SITUATIONS.filter((s) => s.police);
export const GENERAL_SITUATIONS = SITUATIONS.filter((s) => !s.police);

// ── WHO they're dealing with — changes the RIGHT QUESTIONS to ask ────────
// The rights are the same; the tactically correct questions differ. That is
// the whole reason to ask "Police, FBI, ICE, or not sure?" before advising.
export type Agency = "police" | "fbi" | "ice" | "unknown";

export const AGENCIES: { id: Agency; label: string; emoji: string }[] = [
  { id: "police", label: "Police", emoji: "🚔" },
  { id: "fbi", label: "FBI / federal agents", emoji: "🕵️" },
  { id: "ice", label: "ICE / immigration", emoji: "🛂" },
  { id: "unknown", label: "Not sure", emoji: "❓" },
];

const AGENCY_GUIDANCE: Record<Agency, string> = {
  police: `They are LOCAL/STATE POLICE. The key question to have them ask: "Am I being detained, or am I free to go?" Then, as it applies: "I do not consent to a search." / "I'm exercising my right to remain silent." / "I want a lawyer." State law (stop-and-ID, license-on-demand, recording) governs the details — use the LAW CONTEXT for their state.`,
  fbi: `They are FEDERAL AGENTS (FBI/DEA/ATF/etc.). Two things change everything: (1) agents may legally lie to you, but LYING TO THEM IS A FEDERAL FELONY (18 U.S.C. § 1001) — so the strategy is silence, not explanation; (2) they often come to "just talk" with no warrant. The key questions to have them ask: "Am I free to leave?" and "Am I under arrest?" — and the key sentence: "I'm not going to answer questions without a lawyer. Please give me your card so my attorney can contact you." They do NOT have to let agents in without a judicial warrant, do NOT have to answer questions, and should NOT try to talk their way out. Take the business card; call a lawyer.`,
  ice: `They are ICE / IMMIGRATION. The single most important question, said through the closed door: "Do you have a WARRANT signed by a JUDGE?" An ICE administrative form (I-200 / I-205, signed by an ICE officer) does NOT authorize entering a home — only a JUDICIAL warrant does. They can ask to see it slid under the door or held to a window. Everyone — regardless of status — has the right to remain silent and to a lawyer; they should not sign anything they don't understand, and should not lie or show false documents. Key sentences: "I do not consent to your entry." / "I'm exercising my right to remain silent." / "I want to speak to a lawyer." If detained: they can refuse to sign, ask to call a lawyer or consulate, and memorize a phone number. Family: know their A-number if any, and have a plan for children/pets.`,
  unknown: `They DON'T KNOW who this is. First help them find out, gently, in one question: are the officers in a marked police car / uniform (police), plain clothes saying "federal agents" or "FBI" (federal), or saying "immigration" / "ICE" / asking about status or papers (ICE)? Until it's clear, the safe universal script applies: hands visible, comply physically, "Am I being detained, or am I free to go?", "I do not consent to a search", "I want a lawyer", and don't open the door without a warrant signed by a judge.`,
};

// ── HUMAN PSYCHOLOGY UNDER STRESS — how CrimeAI carries itself ────────────
// A person mid-encounter is scared, flooded, and can't absorb paragraphs.
// Confidence comes from a clear next step delivered calmly, not from
// information. This is the tone protocol every rights flow runs on.
export const STRESS_PROTOCOL = `
HOW TO BE, RIGHT NOW (the person may be scared — this matters more than any fact):
- Steady first. Open with one calm, grounding line, THEN one thing to do. Example: "Okay. You're doing the right thing by checking. First: hands where they can see them, and take one breath."
- Name the feeling once, briefly, without dwelling: "It's normal to feel shaky right now — you're handling it." Never say "calm down."
- One thing at a time. One instruction, or one exact phrase to say, per turn. Then stop. Let them come back.
- Give them WORDS TO REPEAT, in quotes, short enough to say out loud while stressed. Confidence comes from having a script.
- Slow the pace with your sentences: short, plain, no jargon, no lists. Every message should be readable in one glance.
- Ask ONE qualifying question at a time, only what changes the next step. Don't interrogate a scared person.
- Sound like a steady friend beside them, not an authority lecturing them: "you've got this," "I'm right here," "next thing."
- Never predict outcomes or promise it'll be fine. Do give them agency: "here's what you control."
- If they type in caps / fragments / panic: shorter still, and steadier still.
`.trim();

export function agencyGuidance(a: Agency): string { return AGENCY_GUIDANCE[a]; }

// Deterministic no-LLM answer for a situation (over-limit / anonymous / model
// down). Still real rights guidance — the first move + the universal script +
// one intake question — so a person mid-encounter is never handed a stats
// dump or nothing.
export function fallbackForSituation(s: Situation, agency?: Agency | null): string {
  const agencyLine = agency === "fbi" ? "With federal agents: don't explain anything — lying to them is a felony, silence is not. Say: \"I want a lawyer. Please give me your card.\""
    : agency === "ice" ? "With ICE: ask, through the door, \"Do you have a warrant signed by a JUDGE?\" An ICE form (I-200/I-205) is NOT a judicial warrant and does not let them in."
    : agency === "police" ? "With police: the key question is \"Am I being detained, or am I free to go?\""
    : "First, figure out who this is: marked car/uniform = police; plain clothes saying \"federal agents\" = FBI; asking about immigration status = ICE. Until you know, use the safe script below.";
  return [
    "Okay. Take one breath — you're doing the right thing by checking. I'm right here.",
    "",
    s.firstMove,
    "",
    agencyLine,
    "",
    "Say these, calmly and clearly, as they apply:",
    "• \"Am I being detained, or am I free to go?\"",
    "• \"I do not consent to a search.\"",
    "• \"I'm exercising my right to remain silent.\"",
    "• \"I want a lawyer.\"",
    "",
    "Comply physically, assert your rights verbally, and don't argue it on the spot — contest it later, in court. If anyone is in danger right now, call 911.",
    "",
    `To guide you further: ${s.intake[0]}`,
    "",
    "(This is general legal information, not legal advice. Laws vary by state and city.)",
  ].join("\n");
}

// The per-flow instruction appended to the system prompt when a situation is
// active. Layered on top of LEGAL-RIGHTS MODE (already injected by /ask).
export function situationInstruction(s: Situation, voice: boolean, agency?: Agency | null): string {
  const who = agency ? `\nWHO THEY'RE DEALING WITH: ${agencyGuidance(agency)}\n` : `\nWHO THEY'RE DEALING WITH: not yet known. Your FIRST reply must (a) give the first move, then (b) ask exactly one question: are they dealing with the police, FBI/federal agents, ICE/immigration, or not sure? — because the right questions to ask differ. Do not advise beyond the universal safe script until you know.\n`;
  return `
${STRESS_PROTOCOL}

ACTIVE SITUATION: "${s.label}". Run this as a guided conversation — you are their calm, expert companion in this exact moment.
${who}
1) LEAD with the first move, right now, before any question: ${s.firstMove}
2) Then GATHER what you need to give the best guidance — ONE question at a time, never a checklist, in this priority order:
${s.intake.map((q, i) => `   ${i + 1}. ${q}`).join("\n")}
   Skip anything they've already told you or that's obvious from context. If they say it's happening RIGHT NOW, keep every reply to what they can use in the next 30 seconds and defer background.
3) As facts come in, give SPECIFIC, cited guidance from the LAW CONTEXT for their jurisdiction. Center of gravity for this flow: ${s.focus}
4) Always the script: comply physically, assert verbally, don't argue on the roadside — contest later. If anyone is in danger right now → 911 first.
5) Close each turn with the single most useful next thing (a phrase to say, a thing to do, or one question) — not a list.
${voice ? "6) VOICE: this is spoken aloud. One or two short sentences per turn. Say the exact phrase for them to repeat if that's the next step, slowly." : ""}
`.trim();
}

// The in-conversation "Know Your Rights" card content — the model doesn't
// generate this; the client renders it as a message with tappable options.
export const KYR_INTRO = "Okay — I'm right here with you. Tap what's happening, or just tell me. Take one breath first.";
export const AGENCY_PROMPT = "Who are you dealing with? This changes what to ask them.";
