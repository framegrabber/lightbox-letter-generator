import { describe, it, expect } from "vitest";
import { computeMounts } from "../../../src/geometry/mounts";

const baseBBox = { minX: 0, maxX: 100, minY: 0, maxY: 200 };

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
    const out = computeMounts(baseBBox, { ...baseParams, mountShankDiameter: 0 });
    expect(out.slots).toEqual([]);
    expect(out.tabs).toEqual([]);
  });

  it("emits two slots at bbox.minX + xInset and bbox.maxX - xInset", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.slots).toHaveLength(2);
    const xs = out.slots.map((s) => s.x).sort((a, b) => a - b);
    expect(xs).toEqual([20, 80]);
    // both at the same Y
    expect(out.slots.every((s) => s.y === 150)).toBe(true);
  });

  it("derives headDiameter = 2 × shank and slotLength = 4 × shank", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.slots[0].shankDiameter).toBe(4);
    expect(out.slots[0].headDiameter).toBe(8);
    expect(out.slots[0].slotLength).toBe(16);
  });

  it("returns empty tabs when backCavityDepth = 0 (flat-back)", () => {
    const out = computeMounts(baseBBox, { ...baseParams, backCavityDepth: 0 });
    expect(out.slots).toHaveLength(2);
    expect(out.tabs).toEqual([]);
  });

  it("emits two tabs (one per slot) when backCavityDepth > 0", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.tabs).toHaveLength(2);
  });

  it("tab XY brackets the keyhole shape with 2mm margin", () => {
    const out = computeMounts(baseBBox, baseParams);
    // headDiameter = 8, slotLength = 16, slotY = 150
    // Each tab: width = headDiameter + 4 = 12, height = slotLength + headDiameter + 4 = 28
    // Y range: [slotY − slotLength − headDiameter/2 − 2, slotY + 2] = [128, 152]
    // Left tab X: [20 − 6, 20 + 6] = [14, 26]; right tab X: [80 − 6, 80 + 6] = [74, 86]
    const left = out.tabs.find((t) => t.minX === 14);
    const right = out.tabs.find((t) => t.minX === 74);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (!left || !right) return;
    expect(left.maxX).toBe(26);
    expect(right.maxX).toBe(86);
    expect(left.minY).toBe(128);
    expect(left.maxY).toBe(152);
    expect(right.minY).toBe(128);
    expect(right.maxY).toBe(152);
  });

  it("tab Z range = [backCavityDepth − backThickness, backCavityDepth] for typical sizes", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.tabs[0].zBottom).toBe(18); // 20 − 2
    expect(out.tabs[0].zTop).toBe(20);
  });

  it("clamps tab zBottom at 0 when backCavityDepth < backThickness", () => {
    const out = computeMounts(baseBBox, {
      ...baseParams,
      backCavityDepth: 1,
      backThickness: 2,
    });
    expect(out.tabs[0].zBottom).toBe(0);
    expect(out.tabs[0].zTop).toBe(1);
  });
});
