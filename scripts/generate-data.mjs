// ─────────────────────────────────────────────────────────────
// PSCC / CrimeAI — Miami seed-data generator
//
// Produces a realistic, demo-stable incident dataset for the Miami
// beta. Real neighborhood centroids, plausible crime mixes, night-
// weighted timestamps, multi-source provenance + confidence — the
// exact normalized schema described in the roadmap (Section 5.8).
//
// Run:  npm run seed
// Out:  data/miami-incidents.json, data/miami-neighborhoods.json
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// Deterministic PRNG so every demo build is identical.
let _s = 1337;
function rand() {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const jitter = (deg) => (rand() - 0.5) * deg;

// Real Miami / Miami-Dade neighborhoods. `risk` scales incident volume,
// `night` skews timestamps toward late hours, `mix` weights categories.
const NEIGHBORHOODS = [
  { name: "Downtown Miami", lat: 25.7743, lon: -80.1937, risk: 1.5, night: 0.7, mix: { property: 0.45, violent: 0.2, nuisance: 0.25, hazard: 0.1 } },
  { name: "Brickell", lat: 25.7607, lon: -80.1918, risk: 1.1, night: 0.6, mix: { property: 0.55, violent: 0.12, nuisance: 0.23, hazard: 0.1 } },
  { name: "Wynwood", lat: 25.8010, lon: -80.1990, risk: 1.3, night: 0.75, mix: { property: 0.5, violent: 0.15, nuisance: 0.27, hazard: 0.08 } },
  { name: "Little Havana", lat: 25.7659, lon: -80.2197, risk: 1.2, night: 0.55, mix: { property: 0.42, violent: 0.2, nuisance: 0.28, hazard: 0.1 } },
  { name: "Coconut Grove", lat: 25.7282, lon: -80.2436, risk: 0.7, night: 0.5, mix: { property: 0.55, violent: 0.08, nuisance: 0.27, hazard: 0.1 } },
  { name: "Coral Gables", lat: 25.7215, lon: -80.2684, risk: 0.5, night: 0.45, mix: { property: 0.62, violent: 0.05, nuisance: 0.23, hazard: 0.1 } },
  { name: "South Beach", lat: 25.7826, lon: -80.1341, risk: 1.6, night: 0.82, mix: { property: 0.48, violent: 0.18, nuisance: 0.27, hazard: 0.07 } },
  { name: "Mid-Beach", lat: 25.8127, lon: -80.1267, risk: 0.8, night: 0.6, mix: { property: 0.58, violent: 0.1, nuisance: 0.22, hazard: 0.1 } },
  { name: "North Beach", lat: 25.8487, lon: -80.122, risk: 0.9, night: 0.6, mix: { property: 0.5, violent: 0.14, nuisance: 0.26, hazard: 0.1 } },
  { name: "Liberty City", lat: 25.837, lon: -80.22, risk: 1.4, night: 0.6, mix: { property: 0.38, violent: 0.3, nuisance: 0.22, hazard: 0.1 } },
  { name: "Little Haiti", lat: 25.8254, lon: -80.1936, risk: 1.2, night: 0.6, mix: { property: 0.42, violent: 0.24, nuisance: 0.24, hazard: 0.1 } },
  { name: "Overtown", lat: 25.788, lon: -80.203, risk: 1.3, night: 0.6, mix: { property: 0.4, violent: 0.28, nuisance: 0.22, hazard: 0.1 } },
  { name: "Allapattah", lat: 25.815, lon: -80.223, risk: 1.1, night: 0.55, mix: { property: 0.46, violent: 0.2, nuisance: 0.24, hazard: 0.1 } },
  { name: "Edgewater", lat: 25.795, lon: -80.188, risk: 0.9, night: 0.6, mix: { property: 0.58, violent: 0.12, nuisance: 0.2, hazard: 0.1 } },
  { name: "Design District", lat: 25.813, lon: -80.193, risk: 0.8, night: 0.55, mix: { property: 0.6, violent: 0.1, nuisance: 0.22, hazard: 0.08 } },
  { name: "Doral", lat: 25.8195, lon: -80.3553, risk: 0.6, night: 0.5, mix: { property: 0.62, violent: 0.06, nuisance: 0.22, hazard: 0.1 } },
  { name: "Hialeah", lat: 25.8576, lon: -80.2781, risk: 1.0, night: 0.5, mix: { property: 0.5, violent: 0.16, nuisance: 0.24, hazard: 0.1 } },
  { name: "Kendall", lat: 25.6793, lon: -80.3173, risk: 0.7, night: 0.5, mix: { property: 0.6, violent: 0.08, nuisance: 0.22, hazard: 0.1 } },
  { name: "Coral Way", lat: 25.75, lon: -80.27, risk: 0.6, night: 0.5, mix: { property: 0.6, violent: 0.08, nuisance: 0.22, hazard: 0.1 } },
  { name: "Flagami", lat: 25.762, lon: -80.316, risk: 0.7, night: 0.5, mix: { property: 0.55, violent: 0.12, nuisance: 0.23, hazard: 0.1 } },
  { name: "Aventura", lat: 25.9565, lon: -80.139, risk: 0.6, night: 0.45, mix: { property: 0.66, violent: 0.05, nuisance: 0.2, hazard: 0.09 } },
  { name: "Key Biscayne", lat: 25.6939, lon: -80.1626, risk: 0.3, night: 0.4, mix: { property: 0.6, violent: 0.04, nuisance: 0.26, hazard: 0.1 } },
  { name: "Pinecrest", lat: 25.667, lon: -80.3083, risk: 0.35, night: 0.4, mix: { property: 0.64, violent: 0.04, nuisance: 0.22, hazard: 0.1 } },
  { name: "North Miami", lat: 25.8901, lon: -80.1867, risk: 1.0, night: 0.55, mix: { property: 0.48, violent: 0.18, nuisance: 0.24, hazard: 0.1 } },
];

// Category -> incident types + severity range (1-5).
const TYPES = {
  violent: [
    { t: "Assault", sev: [3, 4] },
    { t: "Robbery", sev: [3, 5] },
    { t: "Armed robbery", sev: [4, 5] },
    { t: "Shots fired (reported)", sev: [4, 5] },
    { t: "Battery", sev: [3, 4] },
  ],
  property: [
    { t: "Vehicle break-in", sev: [2, 3] },
    { t: "Theft", sev: [1, 3] },
    { t: "Burglary", sev: [3, 4] },
    { t: "Stolen vehicle", sev: [3, 4] },
    { t: "Bike theft", sev: [1, 2] },
    { t: "Package theft", sev: [1, 2] },
    { t: "Vandalism", sev: [1, 2] },
  ],
  nuisance: [
    { t: "Suspicious person", sev: [1, 2] },
    { t: "Disturbance", sev: [1, 2] },
    { t: "Trespassing", sev: [1, 2] },
    { t: "Noise complaint", sev: [1, 1] },
    { t: "Loitering", sev: [1, 1] },
  ],
  hazard: [
    { t: "Traffic crash", sev: [2, 3] },
    { t: "Road hazard", sev: [1, 2] },
    { t: "Structure fire", sev: [3, 4] },
    { t: "Downed power line", sev: [2, 3] },
    { t: "Flooding", sev: [2, 3] },
  ],
};

// Sources with default confidence weight (roadmap trust ranking 5.8.2).
const SOURCES = [
  { id: "open_data", label: "Miami-Dade Open Data", conf: 0.95, verified: true, weight: 0.46 },
  { id: "scanner", label: "Police Scanner (Miami-Dade hybrid)", conf: 0.82, verified: true, weight: 0.16 },
  { id: "spotcrime", label: "SpotCrime", conf: 0.78, verified: true, weight: 0.14 },
  { id: "liveuamap", label: "LiveUAMap", conf: 0.7, verified: false, weight: 0.09 },
  { id: "nextdoor", label: "Nextdoor", conf: 0.55, verified: false, weight: 0.15 },
];

function weightedCategory(mix) {
  const r = rand();
  let acc = 0;
  for (const [cat, w] of Object.entries(mix)) {
    acc += w;
    if (r <= acc) return cat;
  }
  return "property";
}
function weightedSource() {
  const r = rand();
  let acc = 0;
  for (const s of SOURCES) {
    acc += s.weight;
    if (r <= acc) return s;
  }
  return SOURCES[0];
}
function nightWeightedHour(night) {
  // Higher `night` -> more incidents between 9pm and 4am.
  if (rand() < night) return pick([21, 22, 23, 0, 1, 2, 3, 4]);
  return Math.floor(rand() * 24);
}

const STREETS = ["Biscayne Blvd", "NW 7th Ave", "SW 8th St", "Collins Ave", "Ocean Dr", "NE 2nd Ave", "Coral Way", "Brickell Ave", "NW 27th Ave", "SW 22nd St", "Washington Ave", "Flagler St", "NE 79th St", "SW 137th Ave", "US-1"];

function makeIncidents(daysBack = 30) {
  const incidents = [];
  // Anchor "now" to a fixed instant so the seed is reproducible; the app
  // re-bases timestamps relative to real now at load (see lib/data.ts).
  const NOW = Date.UTC(2026, 5, 15, 18, 0, 0); // 2026-06-15 (matches demo date)
  let n = 0;
  for (const nb of NEIGHBORHOODS) {
    const count = Math.round(nb.risk * 28); // ~14-45 per neighborhood
    for (let i = 0; i < count; i++) {
      const cat = weightedCategory(nb.mix);
      const ttype = pick(TYPES[cat]);
      const sev = ttype.sev[0] + Math.floor(rand() * (ttype.sev[1] - ttype.sev[0] + 1));
      const src = weightedSource();
      const daysAgo = rand() * daysBack;
      const hour = nightWeightedHour(nb.night);
      const occurred = NOW - Math.floor(daysAgo * 86400000);
      const occurredAt = new Date(occurred);
      occurredAt.setUTCHours(hour, Math.floor(rand() * 60), 0, 0);
      const reportedAt = new Date(occurredAt.getTime() + Math.floor(rand() * 90 + 5) * 60000);
      const lat = +(nb.lat + jitter(0.018)).toFixed(5);
      const lon = +(nb.lon + jitter(0.018)).toFixed(5);
      const conf = +Math.max(0.3, Math.min(0.99, src.conf - rand() * 0.12)).toFixed(2);

      // Some incidents are corroborated by a 2nd source (dedup/merge demo).
      const corroborating = [];
      if (rand() < 0.22) {
        const s2 = weightedSource();
        if (s2.id !== src.id) corroborating.push({ source: s2.id, label: s2.label });
      }

      incidents.push({
        incident_id: `MIA-${(++n).toString().padStart(5, "0")}`,
        source: src.id,
        source_label: src.label,
        verified: src.verified,
        category: cat,
        type: ttype.t,
        neighborhood: nb.name,
        block: `${Math.floor(rand() * 90 + 1) * 100} block of ${pick(STREETS)}`,
        lat,
        lon,
        occurred_at: occurredAt.toISOString(),
        reported_at: reportedAt.toISOString(),
        severity: sev,
        confidence: conf,
        corroborating_sources: corroborating,
      });
    }
  }
  // newest first
  incidents.sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at));
  return incidents;
}

mkdirSync(DATA_DIR, { recursive: true });
const incidents = makeIncidents(30);
writeFileSync(join(DATA_DIR, "miami-incidents.json"), JSON.stringify(incidents, null, 0));
writeFileSync(
  join(DATA_DIR, "miami-neighborhoods.json"),
  JSON.stringify(
    NEIGHBORHOODS.map(({ name, lat, lon }) => ({ name, lat, lon })),
    null,
    2
  )
);

console.log(`✓ Generated ${incidents.length} Miami incidents across ${NEIGHBORHOODS.length} neighborhoods`);
console.log(`  -> data/miami-incidents.json`);
console.log(`  -> data/miami-neighborhoods.json`);
