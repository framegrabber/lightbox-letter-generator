import { describe, it, expect } from "vitest";
import { computeBulbHoles } from "../../../src/geometry/bulb-holes";
import type { GlyphContours } from "../../../src/geometry/types";

// 100×200 axis-aligned square in glyph-local coords. CCW outer.
const SQUARE: GlyphContours = [
  [[0, 0], [100, 0], [100, 200], [0, 200]],
];

const baseParams = {
  bulbHoleDiameter: 8,
  bulbHoleSpacing: 30,
  bulbHoleInset: 10,
  bulbHoleMaxCount: 12,
  wallThickness: 5,
};

describe("computeBulbHoles", () => {
  it("returns no holes when diameter is 0 (feature disabled)", async () => {
    const r = await computeBulbHoles(SQUARE, { ...baseParams, bulbHoleDiameter: 0 });
    expect(r.holes).toEqual([]);
    expect(r.warning).toBeUndefined();
  });

  it("returns no holes when contours are empty", async () => {
    const r = await computeBulbHoles([], baseParams);
    expect(r.holes).toEqual([]);
    expect(r.warning).toBeUndefined();
  });

  it("warns when the inset collapses the centerline (square too thin)", async () => {
    // 100×200 square; wall=5 → cavity 90×190; inset=200 (way more than 95) → empty.
    const r = await computeBulbHoles(SQUARE, { ...baseParams, bulbHoleInset: 200 });
    expect(r.holes).toEqual([]);
    expect(r.warning).toBe("bulbhole_inset_collapsed");
  }, 30_000);

  it("places holes evenly along a single-ring cavity", async () => {
    // 100×200 square; wall=5 → cavity 90×190; inset=10 → centerline 70×170.
    // Centerline perimeter = 2*(70+170) = 480 mm.
    // bulbHoleSpacing=30 → desiredCount = round(480/30) = 16.
    // bulbHoleMaxCount=12 → cap of 12 (single ring).
    // holesForRing = min(16, 12) = 12.
    // Step = 480/12 = 40 mm.
    const r = await computeBulbHoles(SQUARE, baseParams);
    expect(r.warning).toBeUndefined();
    expect(r.holes).toHaveLength(12);
    // All holes carry the configured diameter.
    for (const h of r.holes) expect(h.diameter).toBe(8);
    // Holes lie inside the centerline rectangle (with a small tolerance for the
    // round offset's curve approximation).
    for (const h of r.holes) {
      expect(h.x).toBeGreaterThanOrEqual(15 - 1);
      expect(h.x).toBeLessThanOrEqual(85 + 1);
      expect(h.y).toBeGreaterThanOrEqual(15 - 1);
      expect(h.y).toBeLessThanOrEqual(185 + 1);
    }
  }, 30_000);
});
