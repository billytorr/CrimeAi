// Block Strength service — gathers PARTICIPATION data (never crime data) for
// each area and persists the computed score.
//
// ⚠️ This service must never query incidents, hazards, or NSS. Every input is
// a measure of how people WATCH: who is active, how fast they confirm, how
// many hours are covered, who has a Trusted Circle, who is verified.

import { computeBlockStrength, neighborsToNextTier, type BlockStrengthConfig, type BlockStrengthInputs } from "./block-strength";
import { populationForArea } from "./census";
import { listAreas } from "./service";

export const BS_DEFAULTS: BlockStrengthConfig = {
  weights: { coverage: 0.35, responsiveness: 0.20, corroborationRate: 0.15, temporalCoverage: 0.15, circleDensity: 0.10, verifiedShare: 0.05 },
  coverageK: 25,
  responseTargetMinutes: 15,
  verifiedMinLevel: 3,
  tiers: [
    { name: "dark", min: 0 }, { name: "forming", min: 20 }, { name: "watched", min: 40 },
    { name: "protected", min: 60 }, { name: "fortified", min: 80 },
  ],
};

const AVG_HOUSEHOLD_SIZE = 2.6; // census-derived households ≈ population / size

export async function loadBlockConfig(): Promise<{ cfg: BlockStrengthConfig; windowDays: number }> {
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(false);
  const { data } = await db.from("scoring_config").select("key, value").like("key", "bs.%");
  const kv = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
  const w = kv["bs.weights"];
  return {
    cfg: {
      weights: w ? { coverage: w.coverage, responsiveness: w.responsiveness, corroborationRate: w.corroboration_rate, temporalCoverage: w.temporal_coverage, circleDensity: w.circle_density, verifiedShare: w.verified_share } : BS_DEFAULTS.weights,
      coverageK: kv["bs.coverage_k"] ?? BS_DEFAULTS.coverageK,
      responseTargetMinutes: kv["bs.response_target_minutes"] ?? BS_DEFAULTS.responseTargetMinutes,
      verifiedMinLevel: kv["bs.verified_min_level"] ?? BS_DEFAULTS.verifiedMinLevel,
      tiers: kv["bs.tiers"] ?? BS_DEFAULTS.tiers,
    },
    windowDays: kv["bs.window_days"] ?? 14,
  };
}

// Participation snapshot for one area (all watching behavior, zero crime).
async function gatherInputs(areaKey: string, lat: number, lon: number, windowDays: number, verifiedMinLevel: number): Promise<{ inputs: BlockStrengthInputs; hourlyPresence: boolean[] }> {
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const R = 1; // area radius, miles — matches the NSS area definition
  const dLat = R / 69, dLon = R / (69 * Math.cos((lat * Math.PI) / 180));

  // people whose home is in the area
  const { data: locals } = await db.from("profiles")
    .select("id, contacts")
    .gte("lat", lat - dLat).lte("lat", lat + dLat)
    .gte("lon", lon - dLon).lte("lon", lon + dLon).limit(5000);
  const localIds = (locals || []).map((p: any) => p.id);
  const usersWithCircle2Plus = (locals || []).filter((p: any) => Array.isArray(p.contacts) && p.contacts.length >= 2).length;

  // activity in the window: posts by locals (participation, not crime volume)
  let activeUsers = 0, hourlyPresence = new Array(24).fill(false);
  if (localIds.length) {
    const { data: acts } = await db.from("posts")
      .select("user_id, created_at").in("user_id", localIds).gte("created_at", since).limit(5000);
    const active = new Set<string>();
    for (const a of acts || []) {
      if (a.user_id) active.add(a.user_id);
      hourlyPresence[new Date(a.created_at).getHours()] = true;
    }
    activeUsers = active.size;
  }

  // corroboration behavior on local reports
  let reportsInWindow = 0, reportsCorroborated = 0, medianResponseMinutes: number | null = null;
  const { data: localReports } = await db.from("posts")
    .select("id, created_at").eq("kind", "report").gte("created_at", since)
    .gte("lat", lat - dLat).lte("lat", lat + dLat)
    .gte("lon", lon - dLon).lte("lon", lon + dLon).limit(1000);
  reportsInWindow = (localReports || []).length;
  if (reportsInWindow) {
    const ids = (localReports || []).map((r: any) => r.id);
    const { data: corr } = await db.from("corroborations").select("report_id, created_at").in("report_id", ids).limit(5000);
    const firstByReport = new Map<string, number>();
    for (const c of corr || []) {
      const t = +new Date(c.created_at);
      if (!firstByReport.has(c.report_id) || t < firstByReport.get(c.report_id)!) firstByReport.set(c.report_id, t);
    }
    reportsCorroborated = firstByReport.size;
    const latencies = (localReports || [])
      .filter((r: any) => firstByReport.has(r.id))
      .map((r: any) => (firstByReport.get(r.id)! - +new Date(r.created_at)) / 60_000)
      .sort((a: number, b: number) => a - b);
    if (latencies.length) medianResponseMinutes = latencies[Math.floor(latencies.length / 2)];
  }

  // verified share (identity L3+)
  let usersAtVerifiedLevel = 0;
  if (localIds.length) {
    const { count } = await db.from("identity_status")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", localIds).gte("level", verifiedMinLevel);
    usersAtVerifiedLevel = count ?? 0;
  }

  const pop = populationForArea(areaKey).population;
  const households = pop ? Math.round(pop / AVG_HOUSEHOLD_SIZE) : Math.max(1, localIds.length * 2);

  return {
    inputs: {
      activeUsers, households, medianResponseMinutes,
      reportsInWindow, reportsCorroborated,
      hourlyBucketsCovered: hourlyPresence.filter(Boolean).length,
      usersWithCircle2Plus, usersAtVerifiedLevel,
    },
    hourlyPresence,
  };
}

export async function recomputeBlockStrength(): Promise<{ areas: number; persisted: number; errors: number }> {
  const { cfg, windowDays } = await loadBlockConfig();
  const { serverDb } = await import("@/lib/payments/serverdb");
  const db = serverDb(true);
  const areas = listAreas();
  let persisted = 0, errors = 0;

  for (const a of areas) {
    try {
      const { inputs, hourlyPresence } = await gatherInputs(a.areaKey, a.lat, a.lon, windowDays, cfg.verifiedMinLevel);
      const result = computeBlockStrength(inputs, cfg, hourlyPresence);
      const next = neighborsToNextTier(inputs, cfg);
      const { error } = await db.from("block_strength").upsert({
        area_key: a.areaKey, score: result.score, tier: result.tier,
        components: result.explanation.components, explanation: { ...result.explanation, inputs },
        next_tier: next.nextTier, neighbors_needed: next.neighborsNeeded,
        computed_at: new Date().toISOString(),
      }, { onConflict: "area_key" });
      if (error) throw new Error(error.message);
      persisted++;
    } catch {
      errors++;
    }
  }
  return { areas: areas.length, persisted, errors };
}
