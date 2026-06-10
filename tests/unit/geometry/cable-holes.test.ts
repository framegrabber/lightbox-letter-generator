import { describe, it, expect } from "vitest";
import { computeCableHoles } from "../../../src/geometry/cable-holes";
import type { CableHoleLayoutInput } from "../../../src/geometry/cable-holes";
import type { GlyphContours } from "../../../src/geometry/types";

// Helper: square-shape contours, 50 wide × 200 tall, in glyph-local coords.
const SQUARE: GlyphContours = [
  [[0, 0], [50, 0], [50, 200], [0, 200]],
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
});
