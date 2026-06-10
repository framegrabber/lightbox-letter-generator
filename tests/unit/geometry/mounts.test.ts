import { describe, it, expect } from "vitest";
import { computeMounts } from "../../../src/geometry/mounts";
import type { GlyphContours } from "../../../src/geometry/types";

// Square 100 × 200 — slice at any interior Y returns {minX: 0, maxX: 100}.
const SQUARE: GlyphContours = [
  [[0, 0], [100, 0], [100, 200], [0, 200]],
];

// V-shape: triangle apex at (50, 0), top corners at (0, 200) and (100, 200).
// At y=20 (10% of height) the slice is {minX: 45, maxX: 55} (10 wide).
// At y=180 the slice is {minX: 5, maxX: 95} (90 wide).
const V_SHAPE: GlyphContours = [
  [[50, 0], [100, 200], [0, 200]],
];

const baseParams = {
  mountShankDiameter: 4,
  mountSlotY: 150,
  mountSlotXInset: 20,
  wallThickness: 5,
  backThickness: 2,
  backCavityDepth: 20,
};

describe("computeMounts", () => {
  it("returns empty plan when shank diameter is 0 (feature disabled)", () => {
    const out = computeMounts(SQUARE, { ...baseParams, mountShankDiameter: 0 });
    expect(out.slots).toEqual([]);
    expect(out.tabs).toEqual([]);
  });

  it("returns empty plan when mountSlotY is outside the contour's Y range", () => {
    const out = computeMounts(SQUARE, { ...baseParams, mountSlotY: 250 });
    expect(out.slots).toEqual([]);
    expect(out.tabs).toEqual([]);
  });

  it("emits two slots at slice.minX + xInset and slice.maxX − xInset", () => {
    const out = computeMounts(SQUARE, baseParams);
    expect(out.slots).toHaveLength(2);
    const xs = out.slots.map((s) => s.x).sort((a, b) => a - b);
    expect(xs).toEqual([20, 80]); // slice {0, 100}, inset 20
    expect(out.slots.every((s) => s.y === 150)).toBe(true);
  });

  it("uses the slice X-extent at mountSlotY for tapering glyphs (V at high Y)", () => {
    // At y=180, V's slice is {minX: 5, maxX: 95}. With xInset=20, slots at 25 and 75.
    // Bbox-based positioning would have placed slots at 20 and 80 — slot center at 80
    // would land in the empty exterior of the V at y=180.
    const out = computeMounts(V_SHAPE, { ...baseParams, mountSlotY: 180 });
    expect(out.slots).toHaveLength(2);
    const xs = out.slots.map((s) => s.x).sort((a, b) => a - b);
    expect(xs).toEqual([25, 75]);
  });

  it("derives headDiameter = 2 × shank and slotLength = 2 × shank", () => {
    const out = computeMounts(SQUARE, baseParams);
    expect(out.slots[0].shankDiameter).toBe(4);
    expect(out.slots[0].headDiameter).toBe(8);
    expect(out.slots[0].slotLength).toBe(8);
  });

  it("returns empty tabs when backCavityDepth = 0 (flat-back)", () => {
    const out = computeMounts(SQUARE, { ...baseParams, backCavityDepth: 0 });
    expect(out.slots).toHaveLength(2);
    expect(out.tabs).toEqual([]);
  });

  it("emits two tabs (one per slot) when backCavityDepth > 0", () => {
    const out = computeMounts(SQUARE, baseParams);
    expect(out.tabs).toHaveLength(2);
  });

  it("tab Y brackets the keyhole shape with 2mm margin", () => {
    const out = computeMounts(SQUARE, baseParams);
    // headDiameter = 8, slotLength = 8, slotY = 150
    // Y range: [slotY − slotLength − headDiameter/2 − 2, slotY + 2] = [136, 152]
    expect(out.tabs[0].minY).toBe(136);
    expect(out.tabs[0].maxY).toBe(152);
    expect(out.tabs[1].minY).toBe(136);
    expect(out.tabs[1].maxY).toBe(152);
  });

  it("tab X reaches from the slice edge to past the slot", () => {
    const out = computeMounts(SQUARE, baseParams);
    // Slice {0, 100}; left slot at 20, right slot at 80; halfHead = 4.
    // Left tab: [slice.minX − 0.01, slot.x + halfHead + 2] = [-0.01, 26]
    // Right tab: [slot.x − halfHead − 2, slice.maxX + 0.01] = [74, 100.01]
    const left = out.tabs.find((t) => t.maxX === 26);
    const right = out.tabs.find((t) => t.minX === 74);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (!left || !right) return;
    expect(left.minX).toBeCloseTo(-0.01, 5);
    expect(right.maxX).toBeCloseTo(100.01, 5);
  });

  it("tab Z range is [0, backThickness] regardless of backCavityDepth", () => {
    const out = computeMounts(SQUARE, baseParams);
    expect(out.tabs[0].zBottom).toBe(0);
    expect(out.tabs[0].zTop).toBe(2); // backThickness

    const deeperCavity = computeMounts(SQUARE, { ...baseParams, backCavityDepth: 50 });
    expect(deeperCavity.tabs[0].zBottom).toBe(0);
    expect(deeperCavity.tabs[0].zTop).toBe(2);
  });

  it("V-shape tab X reaches the slice edge for tapering letters", () => {
    const out = computeMounts(V_SHAPE, { ...baseParams, mountSlotY: 180 });
    // Slice at y=180: {minX: 5, maxX: 95}. Slots at 25 and 75.
    // Left tab: [5 − 0.01, 25 + 4 + 2] = [4.99, 31]
    // Right tab: [75 − 4 − 2, 95 + 0.01] = [69, 95.01]
    const sortedTabs = [...out.tabs].sort((a, b) => a.minX - b.minX);
    expect(sortedTabs[0].minX).toBeCloseTo(4.99, 5);
    expect(sortedTabs[0].maxX).toBe(31);
    expect(sortedTabs[1].minX).toBe(69);
    expect(sortedTabs[1].maxX).toBeCloseTo(95.01, 5);
  });
});
