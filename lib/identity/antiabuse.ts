// Anti-abuse: the cheap defenses that run BEFORE biometrics (spec Layer 5
// rule 7). Pure functions — fixtures can prove them without a database.
//
//   • Report-ring graph detection: accounts that consistently corroborate
//     each other and (almost) nobody else are a collusion cluster.
//   • Behavioral entropy: real humans do not report at perfect intervals.
//
// Velocity limits live in SQL (bump_velocity, supabase/identity.sql).

export interface CorroborationEdge { from: string; to: string; count: number }

export interface RingFlag {
  members: string[];
  internalShare: number;  // fraction of the cluster's corroborations that stay inside it
  totalCorroborations: number;
}

// Detect rings: build mutual-corroboration clusters, flag any whose members
// direct ≥ `internalShareMin` of their corroborations at each other and have
// at least `minTotal` corroborations between them. Organic users corroborate
// many different neighbors; a ring feeds itself.
export function detectReportRings(
  edges: CorroborationEdge[],
  opts: { internalShareMin?: number; minMembers?: number; minTotal?: number } = {},
): RingFlag[] {
  const internalShareMin = opts.internalShareMin ?? 0.8;
  const minMembers = opts.minMembers ?? 3;
  const minTotal = opts.minTotal ?? 6;

  // union-find over MUTUAL edges (A→B and B→A both present)
  const pair = new Set(edges.map((e) => `${e.from}>${e.to}`));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const e of edges) {
    if (pair.has(`${e.to}>${e.from}`)) union(e.from, e.to);
  }

  // gather clusters of mutually-linked users
  const clusters = new Map<string, Set<string>>();
  for (const u of parent.keys()) {
    const r = find(u);
    if (!clusters.has(r)) clusters.set(r, new Set());
    clusters.get(r)!.add(u);
  }

  const flags: RingFlag[] = [];
  for (const members of clusters.values()) {
    if (members.size < minMembers) continue;
    let internal = 0, total = 0;
    for (const e of edges) {
      if (members.has(e.from)) {
        total += e.count;
        if (members.has(e.to)) internal += e.count;
      }
    }
    if (total >= minTotal && total > 0 && internal / total >= internalShareMin) {
      flags.push({ members: [...members].sort(), internalShare: Math.round((internal / total) * 100) / 100, totalCorroborations: total });
    }
  }
  return flags.sort((a, b) => b.totalCorroborations - a.totalCorroborations);
}

// Behavioral entropy: coefficient of variation of inter-event intervals.
// Humans are irregular (CV well above ~0.3); schedulers/bots are metronomic.
// Returns { score, suspicious } where score is the CV (0 = perfectly regular).
export function intervalEntropy(timestampsMs: number[], suspiciousBelow = 0.15): { score: number; suspicious: boolean; samples: number } {
  const t = [...timestampsMs].sort((a, b) => a - b);
  if (t.length < 4) return { score: 1, suspicious: false, samples: t.length }; // too few to judge
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean === 0) return { score: 0, suspicious: true, samples: t.length };
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  return { score: Math.round(cv * 1000) / 1000, suspicious: cv < suspiciousBelow, samples: t.length };
}
