import { describe, it, expect } from "vitest";
import { buildMethodology } from "./methodology";
import { DEFAULTS } from "./config";

describe("methodology — generated from config, cannot drift", () => {
  const md = buildMethodology(DEFAULTS.nss, "ACS 2024 5-year");

  it("contains the live severity weights and half-lives", () => {
    expect(md).toContain("| Violent Armed | 100 | 120 days |");
    expect(md).toContain("| Sexual Offense | 90 | 180 days |");
    expect(md).toContain("| Quality Of Life | 1 | 7 days |");
  });
  it("contains the live source-credibility table incl. zero-weight unverified", () => {
    expect(md).toContain("| Official | 1.00 |");
    expect(md).toContain("| User Unverified | 0.00 |");
    expect(md).toMatch(/single unverified user report counts for 0/);
  });
  it("contains the live caps, sigma, radius and confidence threshold", () => {
    expect(md).toContain("**30%**");
    expect(md).toContain("**5%**");
    expect(md).toContain("σ = 0.5 miles");
    expect(md).toContain("1-mile radius");
    expect(md).toContain("below 0.6");
  });
  it("states the integrity guarantees (engagement/payment can never move it)", () => {
    expect(md).toMatch(/engagement can never move it/i);
    expect(md).toMatch(/Payment can never move it/i);
  });
  it("CHANGES when the config changes — drift is impossible", () => {
    const altered = JSON.parse(JSON.stringify(DEFAULTS.nss));
    altered.caps.ugcShareMax = 0.25;
    altered.severityClasses.violent_armed.weight = 90;
    const md2 = buildMethodology(altered, "ACS 2024 5-year");
    expect(md2).toContain("**25%**");
    expect(md2).toContain("| Violent Armed | 90 | 120 days |");
    expect(md2).not.toContain("**30%**");
  });
  it("names the census release and the ZCTA limitation", () => {
    expect(md).toContain("ACS 2024 5-year");
    expect(md).toMatch(/ZCTA/);
  });
});
