import { describe, expect, it } from "vitest";
import { compoundColor } from "./compoundColor";

describe("compoundColor", () => {
  it("returns the standard color for each known compound", () => {
    expect(compoundColor("SOFT")).toBe("#da291c");
    expect(compoundColor("MEDIUM")).toBe("#ffd400");
    expect(compoundColor("HARD")).toBe("#f5f5f5");
    expect(compoundColor("INTERMEDIATE")).toBe("#43b02a");
    expect(compoundColor("WET")).toBe("#0067ad");
  });

  it("is case-insensitive", () => {
    expect(compoundColor("soft")).toBe(compoundColor("SOFT"));
  });

  it("falls back to a neutral color for an unrecognized compound, without throwing", () => {
    expect(() => compoundColor("UNKNOWN")).not.toThrow();
    expect(compoundColor("UNKNOWN")).toBe("var(--pw-status-neutral)");
  });

  it("falls back to the neutral color for null or undefined", () => {
    expect(compoundColor(null)).toBe("var(--pw-status-neutral)");
    expect(compoundColor(undefined)).toBe("var(--pw-status-neutral)");
  });
});
