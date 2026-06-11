export type GridSpacing = { major: number; minor: number };

const NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const TARGET_MAJOR_LINES = 5;
const DEFAULT_SPACING: GridSpacing = { major: 50, minor: 10 };

// Pick a "nice number" major spacing so the geometry's largest horizontal
// dimension spans roughly TARGET_MAJOR_LINES major squares. Minor is always
// major / 5. Falls back to a sensible default for non-positive / non-finite
// input (no geometry yet, NaN, etc.).
export function pickGridSpacing(bboxMaxDim: number): GridSpacing {
  if (!Number.isFinite(bboxMaxDim) || bboxMaxDim <= 0) {
    return DEFAULT_SPACING;
  }
  const ideal = bboxMaxDim / TARGET_MAJOR_LINES;
  const major =
    NICE_NUMBERS.find((n) => n >= ideal) ??
    NICE_NUMBERS[NICE_NUMBERS.length - 1];
  return { major, minor: major / 5 };
}

export type ComponentLike = {
  xOffset: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

// Returns the world-space XY bbox covering every component using each
// component's pre-centering bbox plus its xOffset. The worker stores
// `vertProperties` already centered on the component's own bbox while keeping
// `bbox` (pre-centering, in word space) and `xOffset` (the word-space minX).
// PreviewLetter places the component group at (xOffset + cx, cy), which means
// the world-space X extent is exactly [xOffset + bbox.minX, xOffset + bbox.maxX]
// and the Y extent is [bbox.minY, bbox.maxY]. No vertex walk needed.
export function componentsBBox(
  components: ReadonlyArray<ComponentLike>,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (components.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of components) {
    const wx0 = c.xOffset + c.bbox.minX;
    const wx1 = c.xOffset + c.bbox.maxX;
    if (wx0 < minX) minX = wx0;
    if (wx1 > maxX) maxX = wx1;
    if (c.bbox.minY < minY) minY = c.bbox.minY;
    if (c.bbox.maxY > maxY) maxY = c.bbox.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}
