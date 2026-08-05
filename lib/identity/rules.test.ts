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

// ── RULE 3: identity is NEVER required to post or report ────────────
// The report submission path (composer → addPost → posts insert) must have
// no identity reference at all — level L0 users report exactly like L4.
describe("Rule 3 — report submission is identity-free (L0 reports succeed)", () => {
  const REPORT_PATH_FILES = [
    "components/ComposeSheet.tsx", // the report composer
    "lib/social.ts",               // addPost / persistence
  ];
  const FORBIDDEN = [
    /from\s+["']@\/lib\/identity/,
    /identity_status|identity_level|identityLevel/,
    /computeLevel|updateIdentityFactors|recordVendorResult/,
    /\bIDV\b|verificationRequired/i,
  ];
  for (const f of REPORT_PATH_FILES) {
    it(`${f} contains no identity requirement`, () => {
      const src = read(f);
      for (const rx of FORBIDDEN) {
        expect(src, `${f} must not match ${rx}`).not.toMatch(rx);
      }
    });
  }
  it("the posts INSERT policy gates only on auth + ban — never identity level", () => {
    const schema = read("supabase/schema.sql") + read("supabase/admin.sql");
    // the only insert conditions may be user ownership and the ban flag.
    // (bare 'identity' is Postgres column syntax — check the real objects)
    expect(schema).not.toMatch(/identity_status|identity_level|identity_events/i);
  });
});
