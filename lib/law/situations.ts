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
}

export const SITUATIONS: Situation[] = [
  {
    id: "pulled_over", label: "Pulled over", emoji: "🚔",
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
    id: "stopped_street", label: "Stopped on the street", emoji: "🚶",
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
    id: "police_at_door", label: "Police at my door", emoji: "🚪",
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
    id: "recording", label: "Recording police", emoji: "🎥",
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
    id: "arrested", label: "Being arrested", emoji: "⚖️",
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

// Deterministic no-LLM answer for a situation (over-limit / anonymous / model
// down). Still real rights guidance — the first move + the universal script +
// one intake question — so a person mid-encounter is never handed a stats
// dump or nothing.
export function fallbackForSituation(s: Situation): string {
  return [
    s.firstMove,
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
export function situationInstruction(s: Situation, voice: boolean): string {
  return `
ACTIVE SITUATION: "${s.label}". Run this as a guided conversation — you are their calm, expert companion in this exact moment.
1) LEAD with the first move, right now, before any question: ${s.firstMove}
2) Then GATHER what you need to give the best guidance — ONE or TWO short questions at a time, never a checklist, in this priority order:
${s.intake.map((q, i) => `   ${i + 1}. ${q}`).join("\n")}
   Skip anything they've already told you or that's obvious from context. If they say it's happening RIGHT NOW, keep every reply to what they can use in the next 30 seconds and defer background.
3) As facts come in, give SPECIFIC, cited guidance from the LAW CONTEXT for their jurisdiction. Center of gravity for this flow: ${s.focus}
4) Always the script: comply physically, assert verbally, don't argue on the roadside — contest later. If anyone is in danger right now → 911 first.
5) Close each turn with the single most useful next thing (a phrase to say, a thing to do, or one question) — not a list.
${voice ? "6) VOICE: this is spoken aloud. One or two short sentences per turn. Say the exact phrase for them to repeat if that's the next step." : ""}
`.trim();
}
