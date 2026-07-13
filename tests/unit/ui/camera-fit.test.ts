import { describe, it, expect } from "vitest";
import { computeOrthoFit, fitFarPlane } from "../../../src/ui/camera-fit";

describe("fitFarPlane", () => {
  it("places the far plane well beyond the geometry", () => {
    // Repro numbers from the blank-ortho bug: "DJ Kofiwan" at letterHeight
    // 420 → word width (maxDim) 2098 mm, auto-fit camera distance 2525 mm.
    // three.js's default ortho far plane (2000) clipped the whole model.
    expect(fitFarPlane(2525, 2098)).toBe(2525 + 2 * 2098);
  });
});

describe("computeOrthoFit", () => {
  const frustumWidth = 1400;
  const frustumHeight = 900;

  it("zoom is limited by the wider axis (with padding)", () => {
    const { zoom } = computeOrthoFit(frustumWidth, frustumHeight, { x: 2098, y: 60 }, 2525, 2098);
    expect(zoom).toBeCloseTo(1400 / (2098 * 1.15), 5);
  });

  it("zoom is limited by height when the geometry is tall", () => {
    const { zoom } = computeOrthoFit(frustumWidth, frustumHeight, { x: 100, y: 2000 }, 2400, 2000);
    expect(zoom).toBeCloseTo(900 / (2000 * 1.15), 5);
  });

  it("regression: far plane exceeds the camera-to-geometry distance for large words", () => {
    // Geometry sits centred around the fit target at distance `dist`; its far
    // side is at most dist + maxDim/2 away. The default three.js far (2000)
    // failed this for any word wider than ~1900 mm → blank ortho view.
    const dist = 2525;
    const maxDim = 2098;
    const { far } = computeOrthoFit(frustumWidth, frustumHeight, { x: 2098, y: 60 }, dist, maxDim);
    expect(far).toBeGreaterThan(dist + maxDim / 2);
    expect(far).toBeGreaterThan(2000);
  });
});
