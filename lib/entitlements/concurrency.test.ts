import { describe, it, expect } from "vitest";

// Model of the consume_usage() SQL semantics: a single atomic
// check-and-increment. This proves the LOGIC invariant — under N concurrent
// consumes against a limit L, exactly L succeed and never L+1. The real
// atomicity is enforced by Postgres (one UPDATE … WHERE count+amount<=limit
// RETURNING) and is proven against the live DB in the Phase 1 report; this
// keeps the invariant covered in CI without a database.
function makeAtomicCounter(limit: number) {
  let count = 0;
  // Emulates the single-statement guarantee: the compare and the write are
  // indivisible, exactly as the SQL function makes them.
  return function consume(amount = 1): { allowed: boolean; count: number } {
    if (limit >= 0 && count + amount > limit) return { allowed: false, count };
    count += amount;
    return { allowed: true, count };
  };
}

describe("atomic consume invariant", () => {
  it("exactly `limit` of N concurrent single-unit consumes succeed", async () => {
    const limit = 5;
    const consume = makeAtomicCounter(limit);
    const attempts = 50;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => Promise.resolve().then(() => consume(1))),
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(limit); // never 6, never 4
  });

  it("blocked capability (limit 0) never allows a consume", () => {
    const consume = makeAtomicCounter(0);
    expect(consume(1).allowed).toBe(false);
    expect(consume(1).allowed).toBe(false);
  });

  it("unlimited (-1) always allows", () => {
    const consume = makeAtomicCounter(-1);
    for (let i = 0; i < 1000; i++) expect(consume(1).allowed).toBe(true);
  });

  it("multi-unit consume respects the boundary exactly", () => {
    const consume = makeAtomicCounter(10);
    expect(consume(7).allowed).toBe(true);  // 7
    expect(consume(3).allowed).toBe(true);  // 10 (exact)
    expect(consume(1).allowed).toBe(false); // would be 11
  });
});
