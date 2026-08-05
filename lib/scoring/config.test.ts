import { describe, it, expect } from "vitest";
import { DEFAULTS, validateScoringConfig } from "./config";

const clone = () => JSON.parse(JSON.stringify(DEFAULTS));

describe("scoring config validation — fails loudly (Rule 9)", () => {
  it("the spec seed defaults are valid", () => {
    expect(() => validateScoringConfig(DEFAULTS)).not.toThrow();
  });
  it("seed values match the spec tables (spot checks)", () => {
    const c = DEFAULTS.nss;
    expect(c.severityClasses.violent_armed).toEqual({ weight: 100, halflifeDays: 120 });
    expect(c.severityClasses.sexual_offense).toEqual({ weight: 90, halflifeDays: 180 });
    expect(c.severityClasses.quality_of_life).toEqual({ weight: 1, halflifeDays: 7 });
    expect(c.sourceWeights.user_unverified).toBe(0);
    expect(c.sourceWeights.official).toBe(1);
    expect(c.spatialSigmaMiles).toBe(0.5);
    expect(c.caps).toEqual({ ugcShareMax: 0.3, singleUserShareMax: 0.05 });
  });
  it("negative severity weight throws", () => {
    const c = clone(); c.nss.severityClasses.violent_armed.weight = -1;
    expect(() => validateScoringConfig(c)).toThrow(/invalid weight/);
  });
  it("zero half-life throws", () => {
    const c = clone(); c.nss.severityClasses.disorder.halflifeDays = 0;
    expect(() => validateScoringConfig(c)).toThrow(/invalid halflife/);
  });
  it("category mapped to unknown class throws", () => {
    const c = clone(); c.nss.categoryClassMap.violent = "nope";
    expect(() => validateScoringConfig(c)).toThrow(/unknown class/);
  });
  it("source weight outside [0,1] throws", () => {
    const c = clone(); c.nss.sourceWeights.official = 1.5;
    expect(() => validateScoringConfig(c)).toThrow(/outside \[0,1\]/);
  });
  it("source mapped to unknown weight key throws", () => {
    const c = clone(); c.nss.sourceKindMap.open_data = "mystery";
    expect(() => validateScoringConfig(c)).toThrow(/unknown weight key/);
  });
  it("caps outside (0,1] throw", () => {
    const c = clone(); c.nss.caps.ugcShareMax = 0;
    expect(() => validateScoringConfig(c)).toThrow(/ugcShareMax/);
  });
  it("missing version throws", () => {
    const c = clone(); c.nss.version = "";
    expect(() => validateScoringConfig(c)).toThrow(/version/);
  });
});
