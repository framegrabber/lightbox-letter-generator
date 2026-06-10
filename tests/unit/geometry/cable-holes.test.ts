import { describe, it, expect } from "vitest";
import { computeCableHoles, xExtentAtY } from "../../../src/geometry/cable-holes";
import type { CableHoleLayoutInput } from "../../../src/geometry/cable-holes";
import type { GlyphContours } from "../../../src/geometry/types";

// Helper: square-shape contours, 50 wide × 200 tall, in glyph-local coords.
const SQUARE: GlyphContours = [
  [[0, 0], [50, 0], [50, 200], [0, 200]],
];

// V-shape: triangle with apex at (50, 0), top corners at (0, 200) and (100, 200).
// At y=200 the V is 100 wide; at y=0 it collapses to a single point at x=50.
// At y=20 the slice X-extent is far inboard from the bbox extent.
const V_SHAPE: GlyphContours = [
  [[50, 0], [100, 200], [0, 200]],
];

const baseParams = {
  cableHoleDiameter: 8,
  cableHoleY: 100,
  cableHoleZ: 10,
  cableHoleAtEnds: true,
  wallThickness: 5,
};

describe("computeCableHoles", () => {
  it("returns [] when diameter is 0 (feature disabled)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleDiameter: 0 });
    expect(out).toEqual([]);
  });

  it("returns [] when layout is empty", () => {
    const out = computeCableHoles([], new Map(), baseParams);
    expect(out).toEqual([]);
  });

  it("emits a single boundary cylinder between two adjacent letters (atEnds=false)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 }, // letter 1 left edge in word space = 60
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    // letter 0 right edge: 0 + 50 = 50; letter 1 left edge: 60 + 0 = 60; gap = 10.
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(55); // midpoint of 50 and 60
    expect(out[0].y).toBe(100);
    expect(out[0].z).toBe(10);
    expect(out[0].diameter).toBe(8);
    // length = max(|gap| + 4*wallThickness, 4*wallThickness) = max(30, 20) = 30
    expect(out[0].length).toBe(30);
  });

  it("skips boundary across a space (originalIndex gap > 1)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 2, xOffset: 100 }, // index 1 was a space; not in the layout
    ];
    const contours = new Map([[0, SQUARE], [2, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toEqual([]);
  });

  it("emits power-entry cylinders at outer ends when atEnds=true", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams); // atEnds: true
    // 1 boundary + 2 power-entries = 3 cylinders.
    expect(out).toHaveLength(3);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    // power-entry left (xOffset 0 + minX 0 = 0), boundary midpoint (55), power-entry right (xOffset 60 + maxX 50 = 110)
    expect(xs).toEqual([0, 55, 110]);
    // power-entry cylinders use length = 4 * wallThickness = 20.
    const ends = out.filter((h) => h.x === 0 || h.x === 110);
    expect(ends.every((h) => h.length === 20)).toBe(true);
  });

  it("single-letter input with atEnds=true emits two cylinders (both walls)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
    ];
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams);
    expect(out).toHaveLength(2);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 50]); // left wall and right wall of the only letter
  });

  it("single-letter input with atEnds=false emits no cylinders", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
    ];
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toEqual([]);
  });

  it("clamps cylinder length to a minimum of 4 * wallThickness (overlap case)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 30 }, // overlap: letter 0 ends at 50, letter 1 starts at 30; gap = -20
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toHaveLength(1);
    // |gap| + 4*wallThickness = 20 + 20 = 40
    expect(out[0].length).toBe(40);
    // midpoint of letter 0 right edge (50) and letter 1 left edge (30) = 40
    expect(out[0].x).toBe(40);
  });

  it("skips entries whose contour map has no entry", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    // Only contour for index 0; index 1 is missing.
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams);
    // No boundary emitted (index 1 has no bbox); only power-entry on index 0 (both walls, since it's effectively the only letter with a bbox).
    expect(out).toHaveLength(2);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 50]);
  });

  it("uses the slice X-extent at cableHoleY for tapering glyphs (V-shape)", () => {
    // V_SHAPE at Y=20 is two narrow strips of triangle wall, far from the bbox edges.
    // At Y=20 (10% of height), edge from (50,0) to (0,200) is at x = 50 + (20-0)/(200-0) * (0-50) = 45.
    // Edge from (50,0) to (100,200) is at x = 50 + (20-0)/(200-0) * (100-50) = 55.
    // So slice = { minX: 45, maxX: 55 }. The hole should sit at x=45 / x=55, NOT at the bbox edges 0 / 100.
    const layout: CableHoleLayoutInput[] = [{ originalIndex: 0, xOffset: 0 }];
    const contours = new Map([[0, V_SHAPE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleY: 20 });
    expect(out).toHaveLength(2);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    expect(xs).toEqual([45, 55]);
  });

  it("returns no holes for glyphs whose contour does not span cableHoleY", () => {
    // V_SHAPE spans Y ∈ [0, 200). At Y=250 there is no material; slice returns null,
    // so no power-entry holes are emitted (the cylinder would be a no-op anyway).
    const layout: CableHoleLayoutInput[] = [{ originalIndex: 0, xOffset: 0 }];
    const contours = new Map([[0, V_SHAPE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleY: 250 });
    expect(out).toEqual([]);
  });

  it("computes the boundary X from each glyph's slice at cableHoleY (not bbox)", () => {
    // Two V-shapes side by side. At Y=20 each V's left edge is at x=45 / right at x=55,
    // i.e. the V at xOffset=0 has slice {45, 55} and the V at xOffset=120 has slice {165, 175}.
    // Boundary midpoint = (55 + 165) / 2 = 110, gap = 110, length = max(110 + 20, 20) = 130.
    // (Naively from the bboxes the midpoint would have been (100 + 120) / 2 = 110 with gap=20, length=40 —
    // same x but a much shorter cylinder that wouldn't pierce the actual walls.)
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 120 },
    ];
    const contours = new Map([[0, V_SHAPE], [1, V_SHAPE]]);
    const out = computeCableHoles(layout, contours, {
      ...baseParams,
      cableHoleY: 20,
      cableHoleAtEnds: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(110);
    expect(out[0].length).toBe(130);
  });
});

describe("xExtentAtY", () => {
  it("returns the bbox-equivalent slice for a rectangle at any interior Y", () => {
    expect(xExtentAtY(SQUARE, 50)).toEqual({ minX: 0, maxX: 50 });
    expect(xExtentAtY(SQUARE, 100)).toEqual({ minX: 0, maxX: 50 });
    expect(xExtentAtY(SQUARE, 199)).toEqual({ minX: 0, maxX: 50 });
  });

  it("returns null when Y is at or above the contour's max Y", () => {
    // Half-open rule [yMin, yMax) — the very top edge is excluded.
    expect(xExtentAtY(SQUARE, 200)).toBeNull();
    expect(xExtentAtY(SQUARE, 250)).toBeNull();
  });

  it("returns null when Y is below the contour", () => {
    expect(xExtentAtY(SQUARE, -1)).toBeNull();
  });

  it("tracks the V-shape taper", () => {
    // Apex at (50, 0); slice at Y=0 is the apex itself (degenerate single point).
    expect(xExtentAtY(V_SHAPE, 0)).toEqual({ minX: 50, maxX: 50 });
    // Halfway up: x ranges 25 → 75.
    expect(xExtentAtY(V_SHAPE, 100)).toEqual({ minX: 25, maxX: 75 });
  });
});
