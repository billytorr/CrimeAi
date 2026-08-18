import { describe, it, expect } from "vitest";
import { matchKnowledge, looksLegal, ALL_KNOWLEDGE, CONSTITUTION } from "./knowledge";
import { OFFICIAL_LAW_DOMAINS, formatLawHits, type LawHit } from "./retrieve";
import { LAW_INSTRUCTION } from "./index";

describe("legal-rights companion — knowledge foundation", () => {
  it("every baked-in entry has an authoritative source and is active law", () => {
    for (const e of ALL_KNOWLEDGE) {
      expect(e.source).toMatch(/^https?:\/\//);
      expect(e.status).toBe("active");
      expect(e.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // official/court/LII/civil-rights sources only
      expect(/congress\.gov|justia\.com|leg\.state\.fl\.us|aclu\.org/.test(e.source)).toBe(true);
    }
  });

  it("includes the Constitution's police-encounter amendments", () => {
    const ids = CONSTITUTION.map((c) => c.id);
    for (const a of ["us-const-1", "us-const-4", "us-const-5", "us-const-6", "us-const-14"]) expect(ids).toContain(a);
  });

  it("matches a traffic-stop question to Fourth Amendment + Rodriguez + FL license rule", () => {
    const hits = matchKnowledge("I got pulled over in a traffic stop, can they search my car and how long can they hold me?", "FL");
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("us-const-4");
    expect(ids.some((id) => id === "scotus-rodriguez" || id === "fl-322-15")).toBe(true);
  });

  it("matches recording-police to the First Amendment / Glik and Florida's consent statute", () => {
    const ids = matchKnowledge("Can I record the police in Florida?", "FL").map((h) => h.id);
    expect(ids).toContain("fl-934-recording");
    expect(ids.some((id) => id === "us-const-1" || id === "scotus-glik")).toBe(true);
  });

  it("NEVER surfaces another state's law", () => {
    const hits = matchKnowledge("stand your ground self defense deadly force", "GA");
    expect(hits.some((h) => h.scope === "state" && h.jurisdiction === "FL")).toBe(false);
    // federal entries still fine for GA users
    const flHits = matchKnowledge("stand your ground self defense deadly force", "FL");
    expect(flHits.some((h) => h.id === "fl-776-syg")).toBe(true);
  });

  it("legal-signal detector fires on rights/police questions and not on ordinary chat", () => {
    expect(looksLegal("what are my rights if I get pulled over")).toBe(true);
    expect(looksLegal("can the cops search my phone")).toBe(true);
    expect(looksLegal("is it legal to carry a gun in my car")).toBe(true);
    expect(looksLegal("hey how are you")).toBe(false);
    expect(looksLegal("is my block safe tonight")).toBe(false);
  });
});

describe("legal-rights companion — live retrieval hygiene", () => {
  it("allow-list is official/authoritative publishers only (no commercial law-firm domains)", () => {
    // .gov / .state.xx.us are government; .edu (Cornell LII), .org (ACLU),
    // and the official code publishers (municode/amlegal/ecode360/justia)
    for (const d of OFFICIAL_LAW_DOMAINS) {
      expect(/\.(gov|org|edu|com|us)$/.test(d)).toBe(true);
    }
    expect(OFFICIAL_LAW_DOMAINS).toContain("congress.gov");
    expect(OFFICIAL_LAW_DOMAINS).toContain("leg.state.fl.us");
    expect(OFFICIAL_LAW_DOMAINS).toContain("library.municode.com");
    // guard: no generic legal-marketing sites ever sneak in
    for (const bad of ["findlaw.com", "avvo.com", "nolo.com", "legalzoom.com"]) expect(OFFICIAL_LAW_DOMAINS).not.toContain(bad);
  });

  it("formats repealed/historic hits with an explicit warning the model must honor", () => {
    const hits: LawHit[] = [
      { title: "Fla. Stat. 790.06 (2019 version)", url: "https://leg.state.fl.us/x", snippet: "old text", domain: "leg.state.fl.us", level: "state", status: "historic" },
      { title: "Ordinance 12-3 repealed", url: "https://library.municode.com/y", snippet: "This section was repealed.", domain: "library.municode.com", level: "local", status: "inactive-signal" },
      { title: "Fla. Stat. 901.151", url: "https://leg.state.fl.us/z", snippet: "current", domain: "leg.state.fl.us", level: "state", status: "active" },
    ];
    const out = formatLawHits(hits);
    expect(out).toContain("HISTORIC VERSION");
    expect(out).toContain("REPEALED/INACTIVE");
    expect(out.split("\n").filter((l) => /^\d+\. \[STATE\] Fla\. Stat\. 901\.151$/.test(l)).length).toBe(1);
  });
});

describe("legal-rights companion — persona guardrails", () => {
  it("instruction enforces information-not-advice, jurisdiction levels, citations, active-vs-repealed, and 911", () => {
    expect(LAW_INSTRUCTION).toMatch(/NOT legal advice/);
    expect(LAW_INSTRUCTION).toMatch(/FEDERAL/);
    expect(LAW_INSTRUCTION).toMatch(/LOCAL/);
    expect(LAW_INSTRUCTION).toMatch(/Never invent a statute/);
    expect(LAW_INSTRUCTION).toMatch(/ACTIVE vs NO LONGER ACTIVE/);
    expect(LAW_INSTRUCTION).toMatch(/Never advise physically resisting/);
    expect(LAW_INSTRUCTION).toMatch(/911/);
    expect(LAW_INSTRUCTION).toMatch(/I do not consent to a search/);
  });
});

import { SITUATIONS, situationById, situationInstruction, POLICE_SITUATIONS, GENERAL_SITUATIONS, AGENCIES, agencyGuidance, STRESS_PROTOCOL, fallbackForSituation } from "./situations";
describe("legal-rights companion — guided situations", () => {
  it("every situation has an opener, a first move, ordered intake questions, and a legal focus", () => {
    expect(SITUATIONS.length).toBeGreaterThanOrEqual(5);
    for (const s of SITUATIONS) {
      expect(s.opener.length).toBeGreaterThan(10);
      expect(s.firstMove.length).toBeGreaterThan(20);
      expect(s.intake.length).toBeGreaterThanOrEqual(3);
      expect(s.focus.length).toBeGreaterThan(20);
    }
    expect(situationById("pulled_over")?.label).toBe("Pulled over");
    expect(situationById("nope")).toBeUndefined();
  });
  it("the flow instruction leads with the first move, gathers 1–2 questions at a time, and keeps the safety script", () => {
    const s = situationById("arrested")!;
    const txt = situationInstruction(s, false);
    expect(txt).toContain(s.firstMove);
    expect(txt).toMatch(/ONE question at a time/);
    expect(txt).toMatch(/comply physically, assert verbally/);
    expect(txt).toMatch(/911/);
    expect(txt).not.toMatch(/VOICE:/);
    expect(situationInstruction(s, true)).toMatch(/VOICE: this is spoken aloud/);
  });
});

describe("legal-rights companion — agency + stress protocol", () => {
  it("splits police-encounter situations from general ones", () => {
    expect(POLICE_SITUATIONS.length).toBe(5);
    expect(GENERAL_SITUATIONS.map((s) => s.id)).toContain("know_rights");
    expect(POLICE_SITUATIONS.every((s) => s.police)).toBe(true);
  });
  it("agency guidance carries the tactically-correct question for each agency", () => {
    expect(AGENCIES.map((a) => a.id)).toEqual(["police", "fbi", "ice", "unknown"]);
    expect(agencyGuidance("police")).toMatch(/Am I being detained, or am I free to go/);
    expect(agencyGuidance("fbi")).toMatch(/18 U\.S\.C\. § 1001/);           // lying to feds is a felony
    expect(agencyGuidance("fbi")).toMatch(/give me your card/i);
    expect(agencyGuidance("ice")).toMatch(/signed by a JUDGE/);               // administrative ≠ judicial warrant
    expect(agencyGuidance("ice")).toMatch(/I-200/);
    expect(agencyGuidance("unknown")).toMatch(/marked police car/i);
  });
  it("flow instruction asks WHO before advising when agency unknown, and includes the stress protocol", () => {
    const s = situationById("police_at_door")!;
    const noAgency = situationInstruction(s, false, null);
    expect(noAgency).toMatch(/police, FBI\/federal agents, ICE\/immigration, or not sure/);
    expect(noAgency).toContain(STRESS_PROTOCOL);
    const ice = situationInstruction(s, false, "ice");
    expect(ice).toMatch(/signed by a JUDGE/);
    expect(ice).not.toMatch(/ask exactly one question: are they dealing/);
  });
  it("stress protocol encodes the human-psychology rules", () => {
    expect(STRESS_PROTOCOL).toMatch(/Steady first/);
    expect(STRESS_PROTOCOL).toMatch(/Never say .calm down./);
    expect(STRESS_PROTOCOL).toMatch(/One thing at a time/);
    expect(STRESS_PROTOCOL).toMatch(/WORDS TO REPEAT/);
    expect(STRESS_PROTOCOL).toMatch(/Never predict outcomes/);
  });
  it("no-LLM fallback is agency-aware rights guidance, opening with a steadying line", () => {
    const s = situationById("police_at_door")!;
    const out = fallbackForSituation(s, "ice");
    expect(out).toMatch(/^Okay\. Take one breath/);
    expect(out).toMatch(/signed by a JUDGE/);
    expect(fallbackForSituation(s, "fbi")).toMatch(/lying to them is a felony/);
  });
});
