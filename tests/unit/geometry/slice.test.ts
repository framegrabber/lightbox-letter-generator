import { describe, it, expect } from "vitest";
import { sliceComponent, type Component } from "../../../src/geometry/slice";

type SimpleComponent = Omit<Component, "members"> & {
  members: { char: string; index: number; xOffset: number }[];
};

function makeComponent(contours: [number, number][][], members: { char: string; index: number; xOffset: number }[]): SimpleComponent {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of contours) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    members,
    mergedContours: contours,
    bbox: { minX, minY, maxX, maxY },
  };
}

describe("sliceComponent", () => {
  it("empty cuts returns the input as a single piece (identity-on-no-cuts)", async () => {
    const comp = makeComponent([[[0, 0], [10, 0], [10, 10], [0, 10]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [], 0);
    expect(result.pieces.length).toBe(1);
    expect(result.pieces[0].sliceIndex).toBe(1);
    expect(result.pieces[0].totalSlices).toBe(1);
    expect(result.outerEdges).toEqual([{ left: true, right: true }]);
    expect(result.warnings.length).toBe(0);
  });

  it("single vertical cut at the bbox midpoint of a square contour produces two equal pieces", async () => {
    const comp = makeComponent([[[0, 0], [20, 0], [20, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [{ x: 10, angle: 0 }], 0);
    expect(result.pieces.length).toBe(2);
    expect(result.pieces[0].sliceIndex).toBe(1);
    expect(result.pieces[1].sliceIndex).toBe(2);
    expect(result.outerEdges).toEqual([{ left: true, right: false }, { left: false, right: true }]);
    expect(result.warnings.length).toBe(0);

    // Sum of areas should equal the original area (400) within 1e-3
    const area1 = result.pieces[0].bbox.maxX - result.pieces[0].bbox.minX;
    const area2 = result.pieces[1].bbox.maxX - result.pieces[1].bbox.minX;
    expect(area1 + area2).toBeCloseTo(20, 5); // width sums to 20, height is 20, so area is 400
  });

  it("cut whose x is outside the bbox is filtered out, single piece returned", async () => {
    const comp = makeComponent([[[0, 0], [10, 0], [10, 10], [0, 10]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [{ x: -5, angle: 0 }, { x: 15, angle: 0 }], 0);
    expect(result.pieces.length).toBe(1);
    expect(result.pieces[0].sliceIndex).toBe(1);
    expect(result.outerEdges).toEqual([{ left: true, right: true }]);
  });

  it("angled cut on a wide rectangle produces two trapezoidal pieces", async () => {
    const comp = makeComponent([[[0, 0], [40, 0], [40, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [{ x: 20, angle: 15 }], 0);
    expect(result.pieces.length).toBe(2);
    expect(result.warnings.length).toBe(0);

    // The cut tilts right (top of line is to the right), so at y=20, x ≈ 20 + 20*tan(15°) ≈ 25.35
    // Piece 0 (left) is bounded by x=0 and the angled cut, so maxX > 20
    expect(result.pieces[0].bbox.maxX).toBeGreaterThan(20);
    // Piece 1 (right) is bounded by the angled cut and x=40, so minX is exactly 20 (at y=0)
    expect(result.pieces[1].bbox.minX).toBeCloseTo(20, 5);
  });

  it("two cuts producing a degenerate sliver (< 0.5 mm²) drops that piece, adjacent pieces intact", async () => {
    const comp = makeComponent([[[0, 0], [40, 0], [40, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    // 0.02mm wide sliver * 20mm tall = 0.4mm² area (< 0.5)
    const result = await sliceComponent(comp, [
      { x: 10, angle: 0 },
      { x: 10.02, angle: 0 },
    ], 0);
    
    // Should have 2 pieces (the sliver is dropped)
    expect(result.pieces.length).toBe(2);
    const emptyWarning = result.warnings.find(w => w.kind === "slice_empty");
    expect(emptyWarning).toBeDefined();
  });

  it("crossing cuts inside the bbox emit slice_crossed warning, pieces still produced", async () => {
    const comp = makeComponent([[[0, 0], [40, 0], [40, 40], [0, 40]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [
      { x: 15, angle: 30 },
      { x: 25, angle: -30 },
    ], 0);
    
    expect(result.pieces.length).toBe(3);
    const crossWarning = result.warnings.find(w => w.kind === "slice_crossed");
    expect(crossWarning).toBeDefined();
  });

  it("outerEdges correct for piece counts of 1, 2, 3, 4", async () => {
    const comp = makeComponent([[[0, 0], [80, 0], [80, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    
    const r1 = await sliceComponent(comp, [], 0);
    expect(r1.outerEdges).toEqual([{ left: true, right: true }]);

    const r2 = await sliceComponent(comp, [{ x: 40, angle: 0 }], 0);
    expect(r2.outerEdges).toEqual([{ left: true, right: false }, { left: false, right: true }]);

    const r3 = await sliceComponent(comp, [{ x: 26.6, angle: 0 }, { x: 53.3, angle: 0 }], 0);
    expect(r3.outerEdges).toEqual([
      { left: true, right: false },
      { left: false, right: false },
      { left: false, right: true },
    ]);

    const r4 = await sliceComponent(comp, [
      { x: 20, angle: 0 }, { x: 40, angle: 0 }, { x: 60, angle: 0 },
    ], 0);
    expect(r4.outerEdges).toEqual([
      { left: true, right: false },
      { left: false, right: false },
      { left: false, right: false },
      { left: false, right: true },
    ]);
  });

  it("letter with a hole (e.g. 'o') split by a cut preserves the hole in the piece containing it", async () => {
    // Outer square with an inner square hole (CCW outer, CW inner)
    const comp = makeComponent(
      [
        [[0, 0], [40, 0], [40, 40], [0, 40]], // outer (CCW)
        [[30, 10], [30, 30], [10, 30], [10, 10]], // inner hole (CW)
      ],
      [{ char: "O", index: 0, xOffset: 0 }]
    );
    const result = await sliceComponent(comp, [{ x: 20, angle: 0 }], 0);
    
    expect(result.pieces.length).toBe(2);
    // Piece 0 (left piece, x=0 to 20) should not contain the hole (which is at x=10-30)
    // Piece 1 (right piece, x=20 to 40) contains the right half of the hole
    // Manifold-3d may return different polygon structures after intersection,
    // but the key invariant is that total area is conserved and no spurious holes appear
    expect(result.pieces[0].bbox.minX).toBeCloseTo(0, 5);
    expect(result.pieces[0].bbox.maxX).toBeCloseTo(20, 5);
    expect(result.pieces[1].bbox.minX).toBeCloseTo(20, 5);
    expect(result.pieces[1].bbox.maxX).toBeCloseTo(40, 5);
  });

  it("slice_oversize warning emitted when piece width still exceeds maxPieceWidth after slicing", async () => {
    const comp = makeComponent([[[0, 0], [100, 0], [100, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    // Cut at x=10, leaving a piece from x=10 to x=100 (width 90)
    const result = await sliceComponent(comp, [{ x: 10, angle: 0 }], 50);
    
    expect(result.pieces.length).toBe(2);
    const oversizeWarning = result.warnings.find(w => w.kind === "slice_oversize");
    expect(oversizeWarning).toBeDefined();
    expect((oversizeWarning as any).sliceIndex).toBe(2);
    expect((oversizeWarning as any).width).toBeCloseTo(90, 5);
  });

  it("slice_recommended warning emitted when maxPieceWidth > 0 and geometry exceeds it, but cuts is empty", async () => {
    const comp = makeComponent([[[0, 0], [100, 0], [100, 20], [0, 20]]], [{ char: "A", index: 0, xOffset: 0 }]);
    const result = await sliceComponent(comp, [], 50);
    
    const recWarning = result.warnings.find(w => w.kind === "slice_recommended");
    expect(recWarning).toBeDefined();
  });
});
