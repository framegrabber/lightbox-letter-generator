import { describe, it, expect } from "vitest";
import { validate, ValidationError } from "../../../src/geometry/validate";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("validate", () => {
  const ok = { ...DEFAULT_PARAMETERS, text: "HI" };

  it("accepts valid parameters", () => {
    const r = validate(ok);
    expect(r.ok).toBe(true);
  });

  it("rejects rabbetDepth >= totalDepth - backThickness", () => {
    const r = validate({ ...ok, rabbetDepth: 25, totalDepth: 25, backThickness: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "rabbetDepth")).toBe(true);
    }
  });

  it("rejects rabbetLipWidth >= wallThickness", () => {
    const r = validate({ ...ok, rabbetLipWidth: 3, wallThickness: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "rabbetLipWidth")).toBe(true);
    }
    const r2 = validate({ ...ok, rabbetLipWidth: 5, wallThickness: 3 });
    expect(r2.ok).toBe(false);
  });

  it("rejects non-positive numeric params", () => {
    for (const field of [
      "letterHeight", "wallThickness", "totalDepth", "backThickness",
      "rabbetDepth", "rabbetLipWidth", "bezierTolerance",
    ] as const) {
      const r = validate({ ...ok, [field]: 0 });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects empty text", () => {
    const r = validate({ ...ok, text: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    const r = validate({ ...ok, letterHeight: NaN });
    expect(r.ok).toBe(false);
  });
});
