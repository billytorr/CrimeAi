import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── RULE 4: no schema column can hold biometric or ID-document data ──
// We scan EVERY migration for column names that could hold a face image,
// face template/embedding, ID document, ID number, or date of birth.
// (`over_18 boolean` is the single allowed age fact.)
describe("Rule 4 — schema holds no biometric or ID-document data", () => {
  const FORBIDDEN_COLUMNS = [
    /\b(face|selfie|biometric|liveness)_?(image|photo|template|embedding|data|scan|vector)?\s+(text|bytea|jsonb|varchar)/i,
    /\b(id|document|passport|license|licence)_(image|photo|scan|front|back|number)\s+(text|bytea|jsonb|varchar|int)/i,
    /\b(date_of_birth|birth_?date|dob)\s+(date|text|timestamptz)/i,
    /\bssn\b/i,
    /\bbytea\b/i, // no binary columns anywhere in identity-adjacent schema
  ];
  const sqlFiles = readdirSync(join(ROOT, "supabase")).filter((f) => f.endsWith(".sql"));

  it(`scans every migration (${'{'}count checked at runtime${'}'})`, () => {
    expect(sqlFiles.length).toBeGreaterThan(10);
  });
  for (const f of sqlFiles) {
    it(`supabase/${f} defines no biometric/ID-capable column`, () => {
      const src = read(join("supabase", f));
      for (const rx of FORBIDDEN_COLUMNS) {
        expect(src, `supabase/${f} must not match ${rx}`).not.toMatch(rx);
      }
    });
  }
  it("identity_status stores only the allowed facts (level, factors, vendor ref, expiry, over_18)", () => {
    const src = read("supabase/identity.sql");
    expect(src).toMatch(/vendor_ref\s+text/);
    expect(src).toMatch(/over_18\s+boolean/);
    expect(src).not.toMatch(/image|photo|template|embedding|birth_?date|dob\b/i);
  });
});

// ── Rule 3 — REVISED 2026-08-06 ─────────────────────────────────────
// Was: "identity is never required to post OR report."
// Now: identity gates REPORTING; POSTING stays open to everyone.
//
// The half that survives is the important one. A crime report pins to the
// map and neighbours act on it, so it is reasonable to demand
// accountability for one. Ordinary posting is how someone participates at
// all — gating that would silently exclude anyone unwilling or unable to
// hand over a government ID, which is disproportionately the people with
// most reason to fear being identified.
//
// So: the POST path must stay identity-free, and the base INSERT policy
// must never gate on identity level. Reporting is gated in the composer,
// where the user can be told why and offered the way through.
describe("Rule 3 (revised) — posting stays identity-free", () => {
  const POST_PATH_FILES = [
    "lib/social.ts", // addPost / persistence — shared by posts AND reports
  ];
  const FORBIDDEN = [
    /from\s+["']@\/lib\/identity/,
    /identity_status|identity_level|identityLevel/,
    /computeLevel|updateIdentityFactors|recordVendorResult/,
    /\bIDV\b|verificationRequired/i,
  ];
  for (const f of POST_PATH_FILES) {
    it(`${f} contains no identity requirement`, () => {
      const src = read(f);
      for (const rx of FORBIDDEN) {
        expect(src, `${f} must not match ${rx}`).not.toMatch(rx);
      }
    });
  }

  it("the posts INSERT policy gates only on auth + ban — never identity level", () => {
    const schema = read("supabase/schema.sql") + read("supabase/admin.sql");
    // (bare 'identity' is Postgres column syntax — check the real objects)
    expect(schema).not.toMatch(/identity_status|identity_level|identity_events/i);
  });

  it("the composer gates the REPORT tab, not the POST tab", () => {
    const src = read("components/ComposeSheet.tsx");
    // reporting is gated…
    expect(src, "the report tab must consult verification").toMatch(/idv\.verified/);
    // …and posting is not: setTab("post") must never be behind a check
    const postBtn = src.slice(src.lastIndexOf("<button", src.indexOf('setTab("post")')), src.indexOf('setTab("post")') + 40);
    expect(postBtn, "POST must not be conditioned on verification").not.toMatch(/verified|idv\./);
  });

  it("an unverified user is redirected to POST rather than blocked outright", () => {
    const src = read("components/ComposeSheet.tsx");
    expect(src).toMatch(/setTab\("post"\);\s*setNeedsVerify\(true\)/);
  });
});
