import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// On-demand divergence report: legacy Safety Score vs parallel NSS, per
// neighborhood. NOT part of the normal suite (network + data dependent) —
// run explicitly for cutover reviews:
//
//   RUN_DIVERGENCE=1 npx vitest run lib/scoring/divergence.report.test.ts
//
// Prints the table; asserts only structural sanity (both scores in range).

const RUN = process.env.RUN_DIVERGENCE === "1";

function loadLocalEnv() {
  const p = join(__dirname, "..", "..", ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

describe.skipIf(!RUN)("NSS divergence report (legacy vs parallel)", () => {
  it("computes and prints old-vs-new for every neighborhood area", async () => {
    loadLocalEnv();
    const { computeAllNSS, divergenceTable } = await import("./service");
    const rows = divergenceTable(await computeAllNSS());

    const pad = (s: unknown, n: number) => String(s).padEnd(n);
    const lines = [pad("AREA", 22) + pad("POOL", 7) + pad("LEGACY", 8) + pad("NSS", 16) + pad("Δ", 6) + "CONF"];
    for (const r of rows) {
      lines.push(pad(r.area, 22) + pad(r.pool, 7) + pad(r.legacy, 8) + pad(r.display, 16) + pad(r.delta > 0 ? `+${r.delta}` : r.delta, 6) + r.confidence);
    }
    const deltas = rows.map((r) => Math.abs(r.delta));
    lines.push(`areas=${rows.length} mean|Δ|=${(deltas.reduce((a, b) => a + b, 0) / rows.length).toFixed(1)} max|Δ|=${Math.max(...deltas)}`);
    const out = process.env.DIVERGENCE_OUT || join(require("node:os").tmpdir(), "nss-divergence.txt");
    require("node:fs").writeFileSync(out, lines.join("\n") + "\n");
    console.log(lines.join("\n"));

    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.legacy).toBeGreaterThanOrEqual(0);
      expect(r.legacy).toBeLessThanOrEqual(100);
      expect(r.nss).toBeGreaterThanOrEqual(0);
      expect(r.nss).toBeLessThanOrEqual(100);
    }
  }, 120_000);
});
