import { describe, it, expect } from "vitest";
import { bandFor, SCORE_BANDS, percentileSentence } from "./bands";

describe("score bands — quartiles of the metro percentile", () => {
  it("maps each quartile to its band", () => {
    expect(bandFor(100).label).toBe("Calm");
    expect(bandFor(75).label).toBe("Calm");
    expect(bandFor(74).label).toBe("Moderate");
    expect(bandFor(50).label).toBe("Moderate");
    expect(bandFor(49).label).toBe("Elevated");
    expect(bandFor(25).label).toBe("Elevated");
    expect(bandFor(24).label).toBe("High activity");
    expect(bandFor(0).label).toBe("High activity");
  });
  it("the median area (50) is NOT flagged as elevated — the old bands did that", () => {
    expect(bandFor(50).label).toBe("Moderate"); // old thresholds: 50 < 55 → "Elevated"
  });
  it("every band has a colour and they are ordered high→low", () => {
    for (const b of SCORE_BANDS) expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
    const mins = SCORE_BANDS.map((b) => b.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });
  it("never returns undefined, even for out-of-range input", () => {
    expect(bandFor(-5).label).toBe("High activity");
    expect(bandFor(999).label).toBe("Calm");
  });
  it("the percentile sentence matches the score", () => {
    expect(percentileSentence(83)).toBe("Safer than about 83% of the metro area.");
  });
});
