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
});
