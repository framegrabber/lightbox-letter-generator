import { getManifold } from "./manifold-init";
import { computeSkeletonPolylines, type Polyline } from "./skeleton";
import type { GlyphContours } from "./types";

export type BulbHole = { x: number; y: number; diameter: number };

export type BulbHoleParams = {
  bulbHoleDiameter: number;
  bulbHoleSpacing: number;
  // bulbHoleInset is retained for backward-compat with persisted saves but is
  // no longer used: the skeleton-thinning algorithm derives the medial axis
  // directly from the cavity, so there is no inset value to tune.
  bulbHoleInset: number;
  bulbHoleMaxCount: number;
  wallThickness: number;
};

export type BulbHoleWarning = "bulbhole_inset_collapsed";

export type BulbHoleResult = { holes: BulbHole[]; warning?: BulbHoleWarning };

// 1 mm grid is a good default for letter-scale shapes: sub-mm placement error
// after the half-pixel sample offset, and the skeleton trace is well below
// any realistic hole spacing.
const SKELETON_PX_SIZE = 1.0;

export async function computeBulbHoles(
  contours: GlyphContours,
  params: BulbHoleParams,
): Promise<BulbHoleResult> {
  if (params.bulbHoleDiameter <= 0) return { holes: [] };
  if (contours.length === 0) return { holes: [] };

  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(contours, "NonZero");
  const cavity = outer.offset(-params.wallThickness, "Round");
  outer.delete();

  if (cavity.isEmpty()) {
    cavity.delete();
    return { holes: [], warning: "bulbhole_inset_collapsed" };
  }

  // Pull the cavity ring polygons (outer + counter-holes), then dispose the
  // CrossSection — everything below is plain JS on the rasterised grid.
  const cavityPolygons = cavity.toPolygons() as unknown as ReadonlyArray<
    ReadonlyArray<readonly [number, number]>
  >;
  cavity.delete();

  const { polylines } = computeSkeletonPolylines(cavityPolygons, SKELETON_PX_SIZE);

  if (polylines.length === 0) {
    return { holes: [], warning: "bulbhole_inset_collapsed" };
  }

  return { holes: walkPolylines(polylines, params) };
}

function walkPolylines(polylines: Polyline[], params: BulbHoleParams): BulbHole[] {
  const segments: { points: Polyline; length: number }[] = polylines.map((p) => {
    let total = 0;
    for (let i = 0; i + 1 < p.length; i++) {
      total += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    }
    return { points: p, length: total };
  });

  const totalLength = segments.reduce((s, seg) => s + seg.length, 0);
  if (totalLength === 0) return [];

  const holes: BulbHole[] = [];
  const dia = params.bulbHoleDiameter;

  for (const seg of segments) {
    // Per-segment hole count: spacing target capped by the segment's share of
    // bulbHoleMaxCount. A segment too short for the spacing collapses to a
    // single hole at its midpoint (so a small letter still gets a bulb).
    const desiredCount = Math.max(
      1,
      Math.round(seg.length / params.bulbHoleSpacing),
    );
    const capShare = Math.max(
      1,
      Math.round((params.bulbHoleMaxCount * seg.length) / totalLength),
    );
    const holesForSegment = Math.min(desiredCount, capShare);

    if (holesForSegment === 1 && seg.length < params.bulbHoleSpacing) {
      const midpoint = sampleAlongPolyline(seg.points, seg.length / 2);
      holes.push({ x: midpoint[0], y: midpoint[1], diameter: dia });
      continue;
    }

    // Place holes inset half a step from each end so they're spread evenly
    // along the segment (not bunched at the boundary).
    const step = seg.length / holesForSegment;
    for (let i = 0; i < holesForSegment; i++) {
      const t = step * (i + 0.5);
      const point = sampleAlongPolyline(seg.points, t);
      holes.push({ x: point[0], y: point[1], diameter: dia });
    }
  }

  return holes;
}

function sampleAlongPolyline(
  points: ReadonlyArray<readonly [number, number]>,
  arcLen: number,
): [number, number] {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return [points[0][0], points[0][1]];

  let traveled = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen === 0) continue;
    if (traveled + segLen >= arcLen) {
      const t = (arcLen - traveled) / segLen;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    traveled += segLen;
  }
  // Fell off the end (rounding); return last vertex.
  const last = points[points.length - 1];
  return [last[0], last[1]];
}
