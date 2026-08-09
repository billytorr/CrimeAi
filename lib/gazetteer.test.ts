import { describe, it, expect } from "vitest";
import { TRICOUNTY_CITIES, findCity, cityInQuery, nearestCity } from "@/lib/gazetteer";
import { resolveAddress } from "@/lib/geocode";

// The launch list is exactly the tri-county spreadsheet: 103 municipalities,
// Miami-Dade 34 · Broward 30 · Palm Beach 39, centroids from the Census
// gazetteer. These tests pin the data so a bad regeneration can't silently
// drop a city or misplace one into the Gulf.
describe("tri-county gazetteer — data integrity", () => {
  it("has all 103 municipalities with the agreed county split", () => {
    expect(TRICOUNTY_CITIES).toHaveLength(103);
    const by = (c: string) => TRICOUNTY_CITIES.filter((x) => x.county === c).length;
    expect(by("Miami-Dade")).toBe(34);
    expect(by("Broward")).toBe(30);
    expect(by("Palm Beach")).toBe(39);
  });

  it("every centroid is inside the tri-county bounding box", () => {
    for (const c of TRICOUNTY_CITIES) {
      expect(c.lat, c.name).toBeGreaterThan(25.1);
      expect(c.lat, c.name).toBeLessThan(27.05);
      expect(c.lon, c.name).toBeGreaterThan(-81.0);
      expect(c.lon, c.name).toBeLessThan(-79.95);
    }
  });

  it("has no duplicate names", () => {
    const names = TRICOUNTY_CITIES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("finds the launch anchors", () => {
    for (const n of ["Miami", "Fort Lauderdale", "West Palm Beach", "Hialeah", "Boca Raton", "Hollywood"]) {
      expect(findCity(n), n).toBeDefined();
    }
  });
});

describe("cityInQuery — longest name wins", () => {
  it("North Miami Beach beats North Miami beats Miami", () => {
    expect(cityInQuery("north miami beach fl")?.name).toBe("North Miami Beach");
    expect(cityInQuery("north miami")?.name).toBe("North Miami");
    expect(cityInQuery("miami")?.name).toBe("Miami");
  });

  it("Palm Beach Gardens is not swallowed by Palm Beach", () => {
    expect(cityInQuery("palm beach gardens")?.name).toBe("Palm Beach Gardens");
  });
});

describe("nearestCity — the onboarding snap", () => {
  it("downtown Fort Lauderdale resolves to Fort Lauderdale, not Miami", () => {
    // This is the launch bug: the old 30-mile snap labelled this user Miami.
    expect(nearestCity(26.1224, -80.1373)?.name).toBe("Fort Lauderdale");
  });

  it("every city's own centroid resolves to itself", () => {
    // Nearest-CENTROID is ambiguous right at coastal margins (a point on the
    // West Palm Beach waterfront is nearer the Town of Palm Beach's centroid
    // across the Intracoastal — a neighboring municipality 1.5 miles away,
    // which the user can correct in one tap). What must always hold is that
    // a point at a city's centroid maps to that city, for all 103.
    for (const c of TRICOUNTY_CITIES) {
      expect(nearestCity(c.lat, c.lon)?.name, c.name).toBe(c.name);
    }
  });

  it("far outside the tri-county area returns null (Orlando)", () => {
    expect(nearestCity(28.5384, -81.3789)).toBeNull();
  });
});

// resolveAddress gazetteer hits return before any network call, so these run
// offline and pin the precedence rules.
describe("resolveAddress — municipalities are their own cities", () => {
  it("Fort Lauderdale resolves with its own city name", async () => {
    const r = await resolveAddress("Fort Lauderdale");
    expect(r?.city).toBe("Fort Lauderdale");
    expect(r?.state).toBe("FL");
  });

  it("Coral Gables is its own city — no longer a 'neighborhood of Miami'", async () => {
    const r = await resolveAddress("Coral Gables");
    expect(r?.city).toBe("Coral Gables");
  });

  it("Wynwood stays a Miami neighborhood", async () => {
    const r = await resolveAddress("Wynwood");
    expect(r?.neighborhood).toBe("Wynwood");
    expect(r?.city).toBe("Miami");
  });

  it("ZIP 33134 now labels Coral Gables as a city", async () => {
    const r = await resolveAddress("33134");
    expect(r?.city).toBe("Coral Gables");
  });
});
