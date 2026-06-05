import { describe, it, expect } from "vitest";
import { mergeIntoComponents } from "../../../src/geometry/merge";
import type { GlyphContours } from "../../../src/geometry/types";
import type { LayoutEntry } from "../../../src/geometry/layout";
import opentype from "opentype.js";

// Helper: build a square contour at (cx,cy) with side `s`. CCW for outer.
function square(cx: number, cy: number, s: number): GlyphContours {
  const h = s / 2;
  return [[
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h],
  ]];
}

// Helper: a fake LayoutEntry. The glyph is unused by mergeIntoComponents but
// the type wants one; we cast a minimal stub.
function entry(char: string, xOffset: number, originalIndex: number): LayoutEntry {
  return { char, glyph: {} as opentype.Glyph, xOffset, originalIndex };
}

describe("mergeIntoComponents", () => {
  it("returns one component per letter when nothing overlaps and no bridges", async () => {
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 1)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],   // [-25..25]
      [1, square(0, 0, 50)],   // [-25..25] before translation; will sit at [75..125]
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(2);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A"]);
    expect(result.components[1].members.map((m) => m.char)).toEqual(["B"]);
    expect(result.warnings).toEqual([]);
  });

  it("merges two letters whose translated outlines overlap", async () => {
    // A is at xOffset=0 (occupies [-25..25]); B at xOffset=30 (occupies [5..55]).
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 30, 1)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0, // already encoded in the xOffsets above
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(1);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A", "B"]);
    expect(result.warnings).toEqual([]);
  });

  it("partial overlap: first two merge, third stays separate", async () => {
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 30, 1), entry("C", 200, 2)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
      [2, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(2);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A", "B"]);
    expect(result.components[1].members.map((m) => m.char)).toEqual(["C"]);
  });

  it("bridge merges two non-overlapping letters", async () => {
    // A at [-25..25], B at [75..125]. Bridge span 100mm centered at 50 → [0..100].
    // Bridge height 10mm centered at 0 → [-5..5]. Bridge enters both squares.
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 1)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 100,
      bridgeHeight: 10,
      bridgeY: 0,
    });
    expect(result.components.length).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("bridge_disconnected warning fires when bar misses one letter", async () => {
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 1)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    // Bridge Y is far above both squares' tops (y=25); they sit at [-25..25] in Y.
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 200,
      bridgeHeight: 4,
      bridgeY: 100,
    });
    expect(result.components.length).toBe(2);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].kind).toBe("bridge_disconnected");
  });

  it("bridge does not connect letters across spaces", async () => {
    // Simulate "A B" — A at original index 0, B at original index 2.
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 2)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [2, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 200,
      bridgeHeight: 10,
      bridgeY: 0,
    });
    expect(result.components.length).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("member.index carries original text position through spaces", async () => {
    // Simulate "A B" — A at original index 0, B at original index 2 (space at index 1).
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 2)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [2, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(2);
    expect(result.components[0].members[0].index).toBe(0);
    expect(result.components[1].members[0].index).toBe(2);
  });
});
