// Pure math for the auto-fit camera framing in PreviewCanvas.

// Breathing room around the fitted geometry at the viewport edges.
const FIT_PADDING = 1.15;

export type OrthoFit = { zoom: number; far: number };

// The auto-fit places the camera `dist` from the fit target; the geometry
// extends at most ~maxDim around that target in any direction. Cameras are
// created with three.js's default far plane (2000 for ortho), which is closer
// than `dist` for words wider than ~1900 mm — clipping the whole model out of
// view. Depth precision is not a concern at preview scale, so be generous.
export function fitFarPlane(dist: number, maxDim: number): number {
  return dist + maxDim * 2;
}

export function computeOrthoFit(
  frustumWidth: number,
  frustumHeight: number,
  size: { x: number; y: number },
  dist: number,
  maxDim: number,
): OrthoFit {
  const zoomY = frustumHeight / (size.y * FIT_PADDING);
  const zoomX = frustumWidth / (size.x * FIT_PADDING);
  return { zoom: Math.min(zoomY, zoomX), far: fitFarPlane(dist, maxDim) };
}
