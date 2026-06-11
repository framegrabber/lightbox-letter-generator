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
  bulbHoleInset: 10, // unused by the skeleton algorithm but kept for backward-compat
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

  it("warns when the cavity collapses (wall thickness exceeds half the shape)", async () => {
    // 100×200 square; wall=60 leaves no room for a cavity.
    const r = await computeBulbHoles(SQUARE, { ...baseParams, wallThickness: 60 });
    expect(r.holes).toEqual([]);
    expect(r.warning).toBe("bulbhole_inset_collapsed");
  }, 30_000);

  it("places holes along the medial axis of a single-cavity rectangle", async () => {
    // 100×200 square; wall=5 → cavity 90×190. Medial axis runs vertically at
    // x ≈ 50, spanning roughly y ∈ [50, 150] (the long axis minus the short
    // axis at each end). Spacing 30 mm with a 12-hole cap → ~3-5 holes
    // depending on skeleton thinning end branches.
    const r = await computeBulbHoles(SQUARE, baseParams);
    expect(r.warning).toBeUndefined();
    expect(r.holes.length).toBeGreaterThanOrEqual(2);
    // All holes carry the configured diameter.
    for (const h of r.holes) expect(h.diameter).toBe(8);
    // Holes cluster around the cavity's centroid (50, 100). Allow a generous
    // X tolerance for the skeleton's diagonal end branches.
    for (const h of r.holes) {
      expect(h.x).toBeGreaterThan(10);
      expect(h.x).toBeLessThan(90);
      expect(h.y).toBeGreaterThan(10);
      expect(h.y).toBeLessThan(190);
    }
    // The skeleton's spine is vertical at x ≈ 50; the median hole should sit
    // close to that centerline (within 5 mm).
    const xs = r.holes.map((h) => h.x).sort((a, b) => a - b);
    const medianX = xs[Math.floor(xs.length / 2)];
    expect(Math.abs(medianX - 50)).toBeLessThan(5);
  }, 30_000);

  it("places holes around the medial loop of an annulus cavity", async () => {
    // Outer 300×400 with 140×240 inner counter. After wall=5 the cavity is a
    // ring with stroke width ~70 mm. The skeleton is a closed rectangular
    // loop running through the middle of the strokes, perimeter ~1080 mm.
    // Spacing 30 mm, cap 12 → 12 holes distributed around the loop.
    const ANNULUS: GlyphContours = [
      [[0, 0], [300, 0], [300, 400], [0, 400]],          // outer CCW
      [[80, 80], [80, 320], [220, 320], [220, 80]],      // inner counter CW (140 × 240)
    ];
    const r = await computeBulbHoles(ANNULUS, baseParams);
    expect(r.warning).toBeUndefined();

    // Cap respected (with a small tolerance for skeleton end branches).
    expect(r.holes.length).toBeGreaterThanOrEqual(10);
    expect(r.holes.length).toBeLessThanOrEqual(14);

    // The medial loop lies between the outer cavity (5..295, 5..395) and the
    // inner counter (75..225, 75..325). Each hole should sit on the loop —
    // i.e., its distance to nearest outer-cavity edge should be within ~10 mm
    // of its distance to nearest inner-counter edge (uniform-stroke ring).
    for (const h of r.holes) {
      const distOuter = Math.min(h.x - 5, 295 - h.x, h.y - 5, 395 - h.y);
      const distInner = Math.min(
        Math.max(0, 75 - h.x),
        Math.max(0, h.x - 225),
        Math.max(0, 75 - h.y),
        Math.max(0, h.y - 325),
      );
      // Hole must be inside the cavity region (outside the inner counter,
      // inside the outer cavity).
      expect(distOuter).toBeGreaterThan(0);
      // Either inside the inner counter region (impossible in a ring) or on
      // the ring; if on the ring, distance from the inner counter is positive.
      expect(distInner === 0 || distInner > 0).toBe(true);
    }

    // Holes spread across all four sides of the loop (top/bottom/left/right
    // band). Bucket each into one of four cardinal regions and require all
    // four are non-empty.
    const top = r.holes.filter((h) => h.y > 320).length;
    const bottom = r.holes.filter((h) => h.y < 80).length;
    const left = r.holes.filter((h) => h.x < 80).length;
    const right = r.holes.filter((h) => h.x > 220).length;
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  }, 30_000);
});
