"use client";

// Know Your Rights — the one-tap quick card for a police encounter.
//
// Built for the moment it's needed: someone stopped, stressed, seconds to act.
// So it is: (1) one tap from the CrimeAI screen, (2) big, readable at arm's
// length, (3) the exact phrases to say — sized to be read aloud, (4) fully
// local, no auth or network (opens instantly, works offline). Content mirrors
// the verified foundation in lib/law/knowledge.ts (same official sources).
//
// Legal INFORMATION, not advice — the same guardrail as the chat companion.
// "Ask CrimeAI" hands off to the assistant with jurisdiction-aware, cited law.

import { useState } from "react";
import Logo from "@/components/Logo";
import { Close } from "@/components/Icons";

type Tab = "stopped" | "car" | "home" | "record" | "arrest";

const SAY = [
  { q: "Am I being detained, or am I free to go?", why: "Forces the officer to say whether you're actually held. If free — calmly leave." },
  { q: "I do not consent to a search.", why: "Say it clearly, don't physically block. Consent is what lets a search proceed without a warrant." },
  { q: "I'm exercising my right to remain silent.", why: "You must SAY it — silence alone may not count. Then stop talking." },
  { q: "I want a lawyer.", why: "Once you say it clearly, questioning must stop. Don't answer more until you have one." },
];

const TABS: { id: Tab; label: string; points: string[]; law: string }[] = [
  { id: "stopped", label: "Stopped on the street", law: "4th Amendment · Terry v. Ohio · Hiibel", points: [
    "Stay calm. Hands visible. Don't run, don't argue, don't touch the officer.",
    "Ask: \"Am I being detained, or am I free to go?\" If free, walk away calmly.",
    "Police can briefly stop you on reasonable suspicion and pat outer clothing only if they think you're armed. That's a frisk, not a full search.",
    "You may have to give your NAME if lawfully detained (Florida has no general stop-and-ID for pedestrians). You don't have to answer other questions.",
    "You can refuse consent to a search: \"I do not consent to a search.\"",
  ]},
  { id: "car", label: "Pulled over", law: "4th Amendment · Rodriguez v. U.S. · Fla. Stat. § 322.15", points: [
    "Pull over safely, engine off, interior light on at night, hands on the wheel. Passengers: hands visible.",
    "In Florida you MUST show your driver license, registration, and insurance when asked. Tell the officer before you reach for them.",
    "If ordered out of the car, get out. Comply physically — assert rights verbally.",
    "You can refuse consent to search the car: \"I do not consent to a search.\" They may still search with probable cause — argue it later, in court.",
    "The stop can't be dragged out (e.g., waiting for a drug dog) without new suspicion. Once the ticket's done, ask: \"Am I free to go?\"",
    "Passengers don't have to identify unless detained on their own suspicion.",
  ]},
  { id: "home", label: "Police at my door", law: "4th Amendment · Payton v. New York", points: [
    "You don't have to open the door. Speak through it or step outside and close it behind you.",
    "Ask to see a WARRANT. To enter, they need a warrant, your consent, or an emergency (someone in danger, hot pursuit).",
    "Read the warrant: address, what they can search for, signed by a judge. They can only search what it names.",
    "Say clearly: \"I do not consent to a search.\" Don't physically block them.",
    "You don't have to answer questions. Anything you say can be used.",
  ]},
  { id: "record", label: "Recording police", law: "1st Amendment · Glik v. Cunniffe · Fla. Stat. § 934.03", points: [
    "You have a First Amendment right to record police doing their job in public.",
    "Don't interfere or get in the way — stand back and keep filming.",
    "Say calmly: \"I'm recording. I'm not interfering.\"",
    "They generally can't take or delete your phone/footage without a warrant. Don't unlock it — you're not required to give a passcode.",
    "Florida's two-party consent law covers PRIVATE conversations, not police performing duties in public.",
  ]},
  { id: "arrest", label: "Being arrested", law: "5th & 6th Amendments · Miranda v. Arizona · Riley v. California", points: [
    "Don't resist, even if you believe it's unfair — resisting is its own charge in Florida (§ 843.02). Fight it in court, not on the street.",
    "Say: \"I'm remaining silent. I want a lawyer.\" Then stop talking. Repeat if needed.",
    "Miranda is only required for CUSTODIAL questioning — anything you volunteer before or after can be used.",
    "Your phone needs a WARRANT to search. Don't consent, don't unlock it.",
    "You have the right to a phone call. Memorize one number. Ask for a public defender at your first court appearance if you can't afford a lawyer.",
    "Remember badge numbers, names, patrol car numbers, and witnesses. Write everything down as soon as you can.",
  ]},
];

export default function KnowYourRights({ onClose, onAskCrimeAI }: { onClose: () => void; onAskCrimeAI: (q: string) => void }) {
  const [tab, setTab] = useState<Tab>("car");
  const cur = TABS.find((t) => t.id === tab)!;

  return (
    <div className="fade-in fixed inset-0 z-[1300] flex flex-col bg-shell">
      {/* header */}
      <div className="safe-top flex items-center gap-3 border-b border-ink/10 px-4 pb-3 pt-4">
        <Logo size={30} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold leading-tight text-ink">Know Your Rights</div>
          <div className="text-[11px] text-ink2">Stay calm · hands visible · comply physically · assert verbally</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink2 active:scale-95"><Close size={22} /></button>
      </div>

      <div className="scroll-area flex-1 px-4 pb-6 pt-4">
        {/* SAY THIS — big, read-aloud size */}
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand">Say this — calmly, clearly</p>
        <div className="space-y-2">
          {SAY.map((s) => (
            <div key={s.q} className="rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3">
              <p className="text-[17px] font-bold leading-snug text-ink">“{s.q}”</p>
              <p className="mt-1 text-xs leading-snug text-ink2">{s.why}</p>
            </div>
          ))}
        </div>

        {/* situation tabs */}
        <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-ink3">Your situation</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-brand text-white" : "border border-ink/15 text-ink2"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-2.5">
          {cur.points.map((p, i) => (
            <li key={i} className="flex gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-bold text-ink">{i + 1}</span>
              <p className="text-[15px] leading-snug text-ink">{p}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[11px] text-ink3">Based on: {cur.law}</p>

        {/* emergency + handoff */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <a href="tel:911" className="flex items-center justify-center rounded-2xl bg-red-600 py-3.5 text-sm font-extrabold text-white active:scale-[0.99]">In danger? Call 911</a>
          <button onClick={() => onAskCrimeAI(`I'm dealing with police right now — ${cur.label.toLowerCase()}. What are my rights here and what exactly should I do and say?`)}
            className="flex items-center justify-center rounded-2xl border border-brand/40 py-3.5 text-sm font-bold text-brand active:scale-[0.99]">
            Ask CrimeAI about this
          </button>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-ink3">
          This is general legal information for the United States with Florida-specific notes, not legal advice, and it can't cover every situation. Laws differ by state and city and change over time. If you're charged or sued, talk to a licensed attorney — ask for a public defender at your first court date if you can't afford one. Sources: U.S. Constitution (constitution.congress.gov), U.S. Supreme Court opinions, Florida Statutes (leg.state.fl.us), ACLU Know Your Rights.
        </p>
      </div>
    </div>
  );
}
