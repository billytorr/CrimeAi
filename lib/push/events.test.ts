import { describe, it, expect } from "vitest";
import {
  planComment, planLike, planMessage, planFollow, planCorroboration,
  planNearbyReport, planNews, planAnnouncement, CRITICAL_SEVERITY,
} from "./events";

describe("never notify someone about their own action", () => {
  it("own comment, like, message, follow, corroboration → nothing", () => {
    expect(planComment({ post_id: "p", user_id: "me", author: "Me", text: "hi", id: "c1" }, "me")).toBeNull();
    expect(planLike({ post_id: "p", user_id: "me" }, "me", "Me", 1)).toBeNull();
    expect(planMessage({ id: "m", sender_id: "me", recipient_id: "me", text: "x" }, "Me")).toBeNull();
    expect(planFollow({ follower_id: "me", target_handle: "h", status: "approved" }, "me", "Me")).toBeNull();
    expect(planCorroboration({ report_id: "r", user_id: "me" }, "me", "Me")).toBeNull();
  });
  it("a report never notifies its own author", () => {
    const plan = planNearbyReport(
      { id: "r1", user_id: "author", author: "A", text: "t", category: "burglary", neighborhood: "Brickell" },
      3, ["author", "neighbour"],
    );
    expect(plan!.recipients).toEqual(["neighbour"]);
  });
});

describe("comments and messages carry the content", () => {
  it("comment notifies the post owner with the text", () => {
    const p = planComment({ post_id: "p1", user_id: "u2", author: "Maria", text: "I saw that too", id: "c9" }, "owner")!;
    expect(p.recipients).toEqual(["owner"]);
    expect(p.title).toBe("Maria commented");
    expect(p.body).toBe("I saw that too");
    expect(p.prefKey).toBe("comment");
    expect(p.dedupeKey).toBe("comment:c9");
  });
  it("long text is truncated, not dumped into the notification", () => {
    const p = planComment({ post_id: "p", user_id: "u", author: "A", text: "x".repeat(300), id: "c" }, "owner")!;
    expect(p.body.length).toBeLessThanOrEqual(80);
    expect(p.body.endsWith("…")).toBe(true);
  });
  it("message notifies the recipient with the sender's name", () => {
    const p = planMessage({ id: "m1", sender_id: "s", recipient_id: "r", text: "you around?" }, "Carlos")!;
    expect(p.recipients).toEqual(["r"]);
    expect(p.title).toBe("Carlos");
    expect(p.body).toBe("you around?");
  });
});

describe("likes are milestone-gated so a popular post can't spam", () => {
  it("notifies for the first three likes individually", () => {
    for (const n of [1, 2, 3]) {
      const p = planLike({ post_id: "p", user_id: "u" }, "owner", "Ana", n)!;
      expect(p).not.toBeNull();
      expect(p.title).toBe("Ana liked your post");
    }
  });
  it("stays silent between milestones", () => {
    for (const n of [4, 5, 7, 11, 25, 99]) {
      expect(planLike({ post_id: "p", user_id: "u" }, "owner", "Ana", n)).toBeNull();
    }
  });
  it("fires again at 10, 50, 100 and every 500", () => {
    for (const n of [10, 50, 100, 500, 1000]) {
      const p = planLike({ post_id: "p", user_id: "u" }, "owner", "Ana", n)!;
      expect(p, `expected a notification at ${n}`).not.toBeNull();
      expect(p.title).toBe(`${n} people liked your post`);
    }
  });
  it("like defaults are per-count deduped", () => {
    expect(planLike({ post_id: "p", user_id: "u" }, "owner", "A", 10)!.dedupeKey).toBe("like:p:10");
  });
});

describe("nearby reports — severity decides whether it is safety-critical", () => {
  const rec = { id: "r1", user_id: "author", author: "A", text: "Break-in", category: "burglary", neighborhood: "Brickell" };

  it("a low-severity report is a routine alert (respects preferences)", () => {
    const p = planNearbyReport(rec, 2, ["n1"])!;
    expect(p.kind).toBe("alert");
    expect(p.prefKey).toBe("report");
  });
  it("a critical report is SAFETY kind — it reaches muted users", () => {
    const p = planNearbyReport(rec, CRITICAL_SEVERITY, ["n1"])!;
    expect(p.kind).toBe("safety");
    expect(p.title.startsWith("⚠️")).toBe(true);
  });
  it("severity 5 is also safety", () => {
    expect(planNearbyReport(rec, 5, ["n1"])!.kind).toBe("safety");
  });
  it("no neighbours → no notification", () => {
    expect(planNearbyReport(rec, 5, [])).toBeNull();
  });
});

describe("follows, corroborations, news, announcements", () => {
  it("a follow REQUEST reads differently from a follow", () => {
    expect(planFollow({ follower_id: "f", target_handle: "t", status: "pending" }, "target", "Sam")!.title).toMatch(/requested to follow/);
    expect(planFollow({ follower_id: "f", target_handle: "t", status: "approved" }, "target", "Sam")!.title).toBe("Sam followed you");
  });
  it("corroboration tells the reporter their report was confirmed", () => {
    const p = planCorroboration({ report_id: "r", user_id: "u2" }, "reporter", "Dana")!;
    expect(p.recipients).toEqual(["reporter"]);
    expect(p.title).toBe("Your report was confirmed");
    expect(p.body).toBe("Dana saw it too");
  });
  it("news and announcements are broadcast under the news preference", () => {
    expect(planNews({ id: "n1", author: "PSCC", text: "Road closure" }, ["a", "b"])!.prefKey).toBe("news");
    const a = planAnnouncement({ id: "a1", title: "Maintenance", body: "Tonight" }, ["a"])!;
    expect(a.kind).toBe("system");
    expect(a.prefKey).toBe("news");
  });
  it("broadcasts with no audience produce nothing", () => {
    expect(planNews({ id: "n", author: "x", text: "y" }, [])).toBeNull();
    expect(planAnnouncement({ id: "a", title: "t", body: "b" }, [])).toBeNull();
  });
});

describe("every plan is deduped", () => {
  it("each event type carries a stable dedupe key", () => {
    const plans = [
      planComment({ post_id: "p", user_id: "u", author: "A", text: "t", id: "c" }, "o"),
      planMessage({ id: "m", sender_id: "s", recipient_id: "r", text: "t" }, "S"),
      planCorroboration({ report_id: "r", user_id: "u" }, "o", "N"),
      planNearbyReport({ id: "rp", user_id: "a", author: "A", text: "t", category: "c", neighborhood: "n" }, 3, ["x"]),
      planNews({ id: "n", author: "a", text: "t" }, ["x"]),
    ];
    for (const p of plans) {
      expect(p!.dedupeKey).toBeTruthy();
      expect(p!.dedupeKey).toMatch(/^[a-z]+:/);
    }
  });
});
