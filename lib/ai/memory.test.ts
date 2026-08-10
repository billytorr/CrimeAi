import { describe, it, expect } from "vitest";
import { extractMemory, isStorableFact } from "@/lib/ai/memory/user-memory";

describe("extractMemory — pull and strip the <remember> tag", () => {
  it("extracts the fact and removes the tag from the answer", () => {
    const raw = "Here's the safety picture for Brickell.\n\n<remember>User is worried about car break-ins on their block.</remember>";
    const { cleaned, fact } = extractMemory(raw);
    expect(fact).toBe("User is worried about car break-ins on their block.");
    expect(cleaned).toBe("Here's the safety picture for Brickell.");
    expect(cleaned).not.toContain("<remember>");
  });
  it("returns null fact when there's no tag", () => {
    const { cleaned, fact } = extractMemory("Just a normal answer.");
    expect(fact).toBeNull();
    expect(cleaned).toBe("Just a normal answer.");
  });
  it("is case-insensitive and trims", () => {
    expect(extractMemory("x <REMEMBER>  y  </REMEMBER>").fact).toBe("y");
  });
});

describe("isStorableFact — memory never holds sensitive data", () => {
  it("accepts a durable preference", () => {
    expect(isStorableFact("Prefers alerts about theft over noise complaints.")).toBe(true);
  });
  it("rejects anything touching sensitive categories", () => {
    for (const bad of [
      "SSN is 123-45-6789",
      "Their credit card number is 4111 1111 1111 1111",
      "Home address is 1200 Brickell Ave",
      "Date of birth: 1990-01-01",
      "Has a fingerprint on file",
    ]) {
      expect(isStorableFact(bad), bad).toBe(false);
    }
  });
  it("rejects empty or absurdly long facts", () => {
    expect(isStorableFact("")).toBe(false);
    expect(isStorableFact("x".repeat(300))).toBe(false);
  });
});
