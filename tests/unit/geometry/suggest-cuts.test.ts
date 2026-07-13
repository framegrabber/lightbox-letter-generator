import { describe, it, expect } from "vitest";
import { suggestCuts } from "../../../src/geometry/slice";

describe("suggestCuts", () => {
  it("returns empty array when maxPieceWidth <= 0", () => {
    const cuts = suggestCuts({ minX: 0, maxX: 100 }, 0);
    expect(cuts).toEqual([]);
  });

  it("returns empty array when word width <= maxPieceWidth", () => {
    const cuts = suggestCuts({ minX: 0, maxX: 100 }, 100);
    expect(cuts).toEqual([]);
  });

  it("returns one cut at the midpoint when word width = 2 * maxPieceWidth", () => {
    const cuts = suggestCuts({ minX: 0, maxX: 200 }, 100);
    expect(cuts.length).toBe(1);
    expect(cuts[0].x).toBe(100);
    expect(cuts[0].angle).toBe(0);
  });

  it("returns two cuts at thirds when word width = 3 * maxPieceWidth", () => {
    const cuts = suggestCuts({ minX: 0, maxX: 300 }, 100);
    expect(cuts.length).toBe(2);
    expect(cuts[0].x).toBeCloseTo(100, 5);
    expect(cuts[0].angle).toBe(0);
    expect(cuts[1].x).toBeCloseTo(200, 5);
    expect(cuts[1].angle).toBe(0);
  });

  it("is idempotent: two suggests with same inputs return identical arrays", () => {
    const cuts1 = suggestCuts({ minX: 10, maxX: 310 }, 100);
    const cuts2 = suggestCuts({ minX: 10, maxX: 310 }, 100);
    expect(cuts1).toEqual(cuts2);
  });

  it("handles non-zero minX correctly", () => {
    const cuts = suggestCuts({ minX: 50, maxX: 250 }, 100);
    expect(cuts.length).toBe(1);
    expect(cuts[0].x).toBe(150);
  });
});
