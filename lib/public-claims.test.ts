import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ══════════════════════════════════════════════════════════════════
// Public privacy claims must match actual practice.
//
// This test exists because they DIDN'T. The app shipped a panel headed
// "What CrimeAI will never do" promising "No facial recognition" while the
// plan of record was to capture selfies, ID documents and face templates.
// A published privacy claim is a representation; the gap between claim and
// practice is what turns a compliance question into a deceptive-practices
// one, and it opened silently.
//
// So: the retired absolute claims can never come back, and the published
// policy must keep disclosing every category we actually collect. If a data
// practice changes, these fail and force the copy to change with it.
//
// Source of truth for the practices: DATA-GOVERNANCE.md
// ══════════════════════════════════════════════════════════════════

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("public claims — retired absolutes must not return", () => {
  // "No facial recognition" full stop is no longer true: identity
  // verification matches a selfie against the user's own ID. The precise
  // claim — that we never identify STRANGERS — is true and is what we keep.
  const RETIRED = [
    /No facial recognition/i,
    /no profiling\b/i,
  ];

  for (const file of ["app/layout.tsx", "components/CoverageMatrix.tsx"]) {
    it(`${file} makes no blanket "no facial recognition" claim`, () => {
      const src = read(file);
      for (const pat of RETIRED) {
        const m = src.match(pat);
        expect(m, `${file} still claims ${pat} (found: "${m?.[0]}") — untrue since IDV was adopted`).toBeNull();
      }
    });
  }

  it("the narrow, still-true promise is kept — we never identify strangers", () => {
    const panel = read("components/CoverageMatrix.tsx");
    // The promise is carried by the heading plus the item beneath it, so
    // assert both halves rather than expecting them adjacent in the source.
    expect(panel, "the 'will never do' heading must remain").toMatch(/will never do/i);
    const neverList = panel.slice(panel.indexOf("const never"), panel.indexOf("const identity"));
    expect(neverList, "'identify a stranger' must be in the NEVER list").toMatch(/identify a stranger/i);
    expect(neverList, "and so must the one-to-one clarification").toMatch(/your own ID/i);
  });

  it("the panel discloses biometric deletion and the training opt-out", () => {
    const panel = read("components/CoverageMatrix.tsx");
    expect(panel, "must state the 24h deletion").toMatch(/24 hours/i);
    expect(panel, "must state biometrics don't train models").toMatch(/never trains|never train/i);
    expect(panel, "must disclose model training + opt-out").toMatch(/opt out/i);
    expect(panel, "must state the law-enforcement standard").toMatch(/warrant|subpoena|court order/i);
  });
});

describe("privacy policy — discloses what we actually collect", () => {
  const legal = read("lib/legal.ts");
  const privacy = legal.slice(legal.indexOf('kind: "privacy"'));

  it("is at version 2 or later (a material change cannot ride on old consent)", () => {
    const m = privacy.match(/version:\s*(\d+)/);
    expect(m, "privacy doc should declare a version").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
  });

  // Each entry: what we do, and the disclosure that must accompany it.
  const MUST_DISCLOSE: Array<[string, RegExp]> = [
    ["biometric collection", /face template|biometric/i],
    ["ID document collection", /government ID/i],
    ["biometric retention period", /24 hours/i],
    ["separate written consent", /written consent/i],
    ["the right to decline", /may decline|can decline/i],
    ["AI training on user data", /train (CrimeAI|models)|AI TRAINING/i],
    ["who receives training data", /Torr AI/i],
    ["BlackSeed Labs as operator", /BlackSeed Labs/i],
    ["training opt-out", /opt out/i],
    ["law-enforcement standard", /subpoena, court order or warrant|warrant/i],
    ["user notification of disclosure", /notify you/i],
    ["no bulk agency access", /standing, bulk or self-serve|no agency has/i],
    ["retention schedule", /HOW LONG WE KEEP/i],
    ["deletion / access rights", /access, correct, export or delete/i],
  ];

  for (const [what, pat] of MUST_DISCLOSE) {
    it(`discloses ${what}`, () => {
      expect(privacy.match(pat), `privacy policy must disclose ${what}`).not.toBeNull();
    });
  }

  it("still promises no sale to advertisers or brokers", () => {
    expect(privacy).toMatch(/do not sell/i);
  });
});
