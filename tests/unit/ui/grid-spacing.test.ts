import { describe, it, expect } from "vitest";
import { pickGridSpacing, componentsBBox } from "../../../src/ui/grid-spacing";

describe("pickGridSpacing", () => {
  it("returns the default {major: 50, minor: 10} for non-positive or non-finite input", () => {
    expect(pickGridSpacing(0)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(-1)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(NaN)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(Infinity)).toEqual({ major: 50, minor: 10 });
  });

  it("picks major=10 when bbox max dim is 50 (ideal=10)", () => {
    // ideal = 50 / 5 = 10, smallest NICE_NUMBER >= 10 is 10
    expect(pickGridSpacing(50)).toEqual({ major: 10, minor: 2 });
  });

  it("picks major=50 for the default-letter case (bbox ~200mm)", () => {
    // ideal = 200 / 5 = 40, smallest NICE_NUMBER >= 40 is 50
    expect(pickGridSpacing(200)).toEqual({ major: 50, minor: 10 });
  });

  it("picks major=500 for very large geometry (bbox ~2000mm)", () => {
    // ideal = 2000 / 5 = 400, smallest NICE_NUMBER >= 400 is 500
    expect(pickGridSpacing(2000)).toEqual({ major: 500, minor: 100 });
  });

  it("caps at the largest NICE_NUMBER for pathological input", () => {
    expect(pickGridSpacing(1_000_000)).toEqual({ major: 5000, minor: 1000 });
  });
});

describe("componentsBBox", () => {
  it("returns null for an empty array", () => {
    expect(componentsBBox([])).toBeNull();
  });

  it("shifts a single component's X extent by xOffset and leaves Y unchanged", () => {
    const out = componentsBBox([
      {
        xOffset: 100,
        bbox: { minX: 0, maxX: 50, minY: -10, maxY: 80 },
      },
    ]);
    expect(out).toEqual({ minX: 100, maxX: 150, minY: -10, maxY: 80 });
  });

  it("covers the union of word-space extents across multiple components", () => {
    // Component A: xOffset=0, X extent [0..50], Y [0..100]
    // Component B: xOffset=200, X extent [0..50] in local => [200..250] in world
    const out = componentsBBox([
      { xOffset: 0, bbox: { minX: 0, maxX: 50, minY: 0, maxY: 100 } },
      { xOffset: 200, bbox: { minX: 0, maxX: 50, minY: -20, maxY: 80 } },
    ]);
    expect(out).toEqual({ minX: 0, maxX: 250, minY: -20, maxY: 100 });
  });
});
