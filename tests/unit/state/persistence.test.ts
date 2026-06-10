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

  it("fills backCavityDepth default when missing", () => {
    const out = migrate({
      letterHeight: 200,
      wallThickness: 10,
    });
    expect(out.backCavityDepth).toBe(20);
  });

  it("preserves an existing backCavityDepth value", () => {
    const out = migrate({
      letterHeight: 200,
      backCavityDepth: 35,
    });
    expect(out.backCavityDepth).toBe(35);
  });

  it("preserves backCavityDepth: 0 (falsy but valid)", () => {
    const out = migrate({ letterHeight: 200, backCavityDepth: 0 });
    expect(out.backCavityDepth).toBe(0);
  });

  it("fills cableHoleDiameter default when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.cableHoleDiameter).toBe(0);
  });

  it("preserves an existing cableHoleDiameter value (including the default 0)", () => {
    const out = migrate({ letterHeight: 200, cableHoleDiameter: 8 });
    expect(out.cableHoleDiameter).toBe(8);
    const zero = migrate({ letterHeight: 200, cableHoleDiameter: 0 });
    expect(zero.cableHoleDiameter).toBe(0);
  });

  it("fills cableHoleY from letterHeight / 2 when missing", () => {
    const out = migrate({ letterHeight: 80 });
    expect(out.cableHoleY).toBe(40);
  });

  it("falls back to default letterHeight / 2 for cableHoleY when both are missing", () => {
    const out = migrate({});
    expect(out.cableHoleY).toBe(100);
  });

  it("preserves an explicit cableHoleY", () => {
    const out = migrate({ letterHeight: 200, cableHoleY: 25 });
    expect(out.cableHoleY).toBe(25);
  });

  it("fills cableHoleZ from backCavityDepth / 2 when missing", () => {
    const out = migrate({ letterHeight: 200, backCavityDepth: 30 });
    expect(out.cableHoleZ).toBe(15);
  });

  it("falls back to default backCavityDepth / 2 for cableHoleZ when both are missing", () => {
    const out = migrate({});
    expect(out.cableHoleZ).toBe(10);
  });

  it("preserves an explicit cableHoleZ", () => {
    const out = migrate({ letterHeight: 200, cableHoleZ: 5 });
    expect(out.cableHoleZ).toBe(5);
  });

  it("fills cableHoleAtEnds default (true) when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.cableHoleAtEnds).toBe(true);
  });

  it("preserves cableHoleAtEnds: false (falsy boolean)", () => {
    const out = migrate({ letterHeight: 200, cableHoleAtEnds: false });
    expect(out.cableHoleAtEnds).toBe(false);
  });

  it("fills mountShankDiameter default when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.mountShankDiameter).toBe(0);
  });

  it("preserves an existing mountShankDiameter value (including 0)", () => {
    const out = migrate({ letterHeight: 200, mountShankDiameter: 4 });
    expect(out.mountShankDiameter).toBe(4);
    const zero = migrate({ letterHeight: 200, mountShankDiameter: 0 });
    expect(zero.mountShankDiameter).toBe(0);
  });

  it("fills mountSlotY from letterHeight × 0.75 when missing", () => {
    const out = migrate({ letterHeight: 80 });
    expect(out.mountSlotY).toBe(60);
  });

  it("falls back to default letterHeight × 0.75 for mountSlotY when both are missing", () => {
    const out = migrate({});
    expect(out.mountSlotY).toBe(150);
  });

  it("preserves an explicit mountSlotY", () => {
    const out = migrate({ letterHeight: 200, mountSlotY: 25 });
    expect(out.mountSlotY).toBe(25);
  });

  it("fills mountSlotXInset from wallThickness × 2 when missing", () => {
    const out = migrate({ wallThickness: 6 });
    expect(out.mountSlotXInset).toBe(12);
  });

  it("falls back to default wallThickness × 2 for mountSlotXInset when both are missing", () => {
    const out = migrate({});
    expect(out.mountSlotXInset).toBe(20);
  });

  it("preserves an explicit mountSlotXInset", () => {
    const out = migrate({ wallThickness: 10, mountSlotXInset: 30 });
    expect(out.mountSlotXInset).toBe(30);
  });
});
