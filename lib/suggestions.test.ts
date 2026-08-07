import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ══════════════════════════════════════════════════════════════════
// Follow suggestions surface people to strangers. That makes the query a
// privacy boundary, not just a feature — and the filtering lives in SQL
// precisely so a client cannot widen it by editing a query parameter.
//
// These pin the guarantees:
//   • a PRIVATE profile is never suggested (they asked not to be found)
//   • no coordinates leave the database — a suggestion list must not become
//     a way to work out where a neighbour lives
//   • the radius is the user's OWN, read server-side, never client-supplied
// ══════════════════════════════════════════════════════════════════

const sql = readFileSync(path.join(process.cwd(), "supabase/official-account.sql"), "utf8");
const fn = sql.slice(sql.indexOf("function public.suggested_follows"), sql.indexOf("revoke all on function public.suggested_follows"));

describe("suggested_follows — privacy guarantees", () => {
  it("excludes private profiles", () => {
    expect(fn).toMatch(/coalesce\(p\.is_private,\s*false\)\s*=\s*false/);
  });

  it("excludes people the user already follows or has requested", () => {
    expect(fn).toMatch(/not exists\s*\(\s*select 1 from public\.follows/);
  });

  it("excludes half-finished profiles", () => {
    expect(fn).toMatch(/coalesce\(p\.onboarded,\s*false\)/);
  });

  it("never returns raw coordinates", () => {
    const returns = sql.slice(sql.indexOf("returns table ("), sql.indexOf("language sql stable"));
    expect(returns).not.toMatch(/\blat\b|\blon\b|latitude|longitude/i);
  });

  it("rounds distance rather than reporting it precisely", () => {
    expect(fn).toMatch(/round\(/);
  });

  it("takes the radius from the caller's own profile, not from an argument", () => {
    // p_limit is the only tunable input; radius comes from the profiles row
    expect(fn).toMatch(/coalesce\(radius_miles,\s*1\)\s*as radius_miles/);
    expect(fn).not.toMatch(/p_radius|p_lat|p_lon/);
  });

  it("caps how many rows a caller can pull", () => {
    expect(fn).toMatch(/least\(p_limit,\s*50\)/);
  });
});

describe("suggested_follows — ordering", () => {
  it("puts official accounts first, then nearest", () => {
    const order = fn.slice(fn.indexOf("order by"));
    const official = order.indexOf("is_official");
    const distance = order.indexOf("distance_miles");
    expect(official, "is_official should appear in ORDER BY").toBeGreaterThan(-1);
    expect(distance, "distance should appear in ORDER BY").toBeGreaterThan(-1);
    expect(official, "@crimeai must sort before distance").toBeLessThan(distance);
  });

  it("official accounts bypass the distance filter entirely", () => {
    // @crimeai is nationwide — it must not drop out for a user with a small
    // radius. Strip comments first; one sits between the term and the OR.
    const code = fn.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    const distanceClause = code.slice(code.lastIndexOf("and ("));
    expect(distanceClause).toMatch(/is_official[\s\S]{0,40}\bor\b/);
    expect(distanceClause).toMatch(/miles_between/);
  });
});

describe("official account setup", () => {
  it("hardcodes no credential", () => {
    // The word "password" is fine in the setup comments; a password VALUE is
    // not. Catch assignments and literals, not prose.
    const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    expect(code, "no password assignment").not.toMatch(/password\s*[:=]/i);
    expect(code, "no encrypted_password write").not.toMatch(/encrypted_password/i);
    expect(code, "no direct insert into auth.users").not.toMatch(/insert\s+into\s+auth\.users/i);
  });

  it("designate_official is service_role only — it mints an official identity", () => {
    expect(sql).toMatch(/revoke all on function public\.designate_official/);
    const grant = sql.slice(sql.indexOf("grant execute on function public.designate_official"));
    expect(grant.split("\n")[0]).not.toMatch(/\bauthenticated\b|\banon\b/);
  });

  it("an official account can never be private", () => {
    expect(sql).toMatch(/is_private\s*=\s*false/);
  });

  it("only one account can hold an official handle", () => {
    expect(sql).toMatch(/create unique index[\s\S]{0,120}where is_official/);
  });
});
