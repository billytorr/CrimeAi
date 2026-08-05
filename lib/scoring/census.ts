// Census population lookup for per-capita NSS normalization (spec Layer 1:
// P(a)). Data: data/census-population.json — real ACS 5-year ZCTA estimates
// with full provenance recorded in the file. Areas without a ZCTA mapping
// return null, which sends nss.ts down its documented fallback (area-based
// density + lowered confidence via populationFactor).
//
// MODULE BOUNDARY (Rule 2): pure data lookup; imports nothing but the JSON.

import censusData from "@/data/census-population.json";

export interface CensusInfo { population: number | null; zctas: string[]; release: string }

const ZCTA_POP: Record<string, number> = censusData.zcta_population;
const AREA_ZCTAS: Record<string, string[]> = censusData.neighborhood_zctas;

export function populationForArea(areaKey: string): CensusInfo {
  const zctas = AREA_ZCTAS[areaKey] || [];
  if (!zctas.length) return { population: null, zctas: [], release: censusData.release };
  let sum = 0;
  for (const z of zctas) {
    const p = ZCTA_POP[z];
    if (typeof p === "number") sum += p;
  }
  return { population: sum > 0 ? sum : null, zctas, release: censusData.release };
}

export function censusRelease(): string {
  return censusData.release;
}
