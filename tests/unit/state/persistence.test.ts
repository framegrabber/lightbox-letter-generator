import { describe, it, expect } from "vitest";

// Re-export migrate via a test-only import path is unnecessary; we test through
// the same JSON shape persistence.ts uses internally. Import the migrate
// function directly by adding it to the module's exports (Step 7).

import { migrate } from "../../../src/state/persistence";

describe("persistence migrate", () => {
  it("fills new connected-letters fields with defaults when missing", () => {
    const out = migrate({
      text: "HI",
      letterHeight: 80,
      wallThickness: 3,
      totalDepth: 50,
      backThickness: 2,
      rabbetDepth: 5,
      insetWidth: 1.5,
      bezierTolerance: 0.1,
      fontSource: { kind: "bundled", id: "anton" },
    });
    expect(out.letterOverlap).toBe(0);
    expect(out.bridgeWidth).toBe(0);
    expect(out.bridgeHeight).toBe(0);
    expect(out.bridgeY).toBe(40); // letterHeight / 2
  });

  it("preserves existing connected-letters values", () => {
    const out = migrate({
      letterHeight: 200,
      letterOverlap: 7,
      bridgeWidth: 12,
      bridgeHeight: 4,
      bridgeY: -50,
    });
    expect(out.letterOverlap).toBe(7);
    expect(out.bridgeWidth).toBe(12);
    expect(out.bridgeHeight).toBe(4);
    expect(out.bridgeY).toBe(-50);
  });

  it("preserves the legacy rabbetLipWidth → insetWidth translation", () => {
    const out = migrate({ rabbetLipWidth: 3, wallThickness: 10 });
    expect(out.insetWidth).toBe(7);
    expect("rabbetLipWidth" in out).toBe(false);
  });

  it("falls back to bridgeY default when letterHeight is missing", () => {
    const out = migrate({});
    // No letterHeight, so we fall back to the default letterHeight.
    expect(out.bridgeY).toBe(100);
  });

  it("fills plexiTolerance default when missing", () => {
    const out = migrate({
      letterHeight: 200,
      wallThickness: 10,
      insetWidth: 5,
    });
    expect(out.plexiTolerance).toBe(0.1);
  });

  it("preserves an existing plexiTolerance value", () => {
    const out = migrate({
      letterHeight: 200,
      plexiTolerance: 0.35,
    });
    expect(out.plexiTolerance).toBe(0.35);
  });

  it("preserves plexiTolerance: 0 (falsy but valid)", () => {
    const out = migrate({ letterHeight: 200, plexiTolerance: 0 });
    expect(out.plexiTolerance).toBe(0);
  });
});
