import { getManifold } from "./manifold-init";
import type { GlyphContours } from "./types";

export type BulbHole = { x: number; y: number; diameter: number };

export type BulbHoleParams = {
  bulbHoleDiameter: number;
  bulbHoleSpacing: number;
  bulbHoleInset: number;
  bulbHoleMaxCount: number;
  wallThickness: number;
};

export type BulbHoleWarning = "bulbhole_inset_collapsed";

export type BulbHoleResult = { holes: BulbHole[]; warning?: BulbHoleWarning };

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
  const centerline = cavity.offset(-params.bulbHoleInset, "Round");

  if (centerline.isEmpty()) {
    outer.delete();
    cavity.delete();
    centerline.delete();
    return { holes: [], warning: "bulbhole_inset_collapsed" };
  }

  const polygons = centerline.toPolygons();
  outer.delete();
  cavity.delete();
  centerline.delete();

  type Ring = { points: ReadonlyArray<[number, number]>; perimeter: number };
  const rings: Ring[] = polygons.map((poly) => {
    let p = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      p += Math.hypot(x2 - x1, y2 - y1);
    }
    return {
      points: poly.map(([x, y]) => [x, y] as [number, number]),
      perimeter: p,
    };
  });

  const totalPerimeter = rings.reduce((s, r) => s + r.perimeter, 0);
  if (totalPerimeter === 0) return { holes: [] };

  const holes: BulbHole[] = [];
  const dia = params.bulbHoleDiameter;

  for (const ring of rings) {
    const desiredCount = Math.max(1, Math.round(ring.perimeter / params.bulbHoleSpacing));
    const capShare = Math.max(
      1,
      Math.round((params.bulbHoleMaxCount * ring.perimeter) / totalPerimeter),
    );
    const holesForRing = Math.min(desiredCount, capShare);

    if (holesForRing === 1 && ring.perimeter < params.bulbHoleSpacing) {
      let cx = 0, cy = 0;
      for (const [x, y] of ring.points) { cx += x; cy += y; }
      cx /= ring.points.length;
      cy /= ring.points.length;
      holes.push({ x: cx, y: cy, diameter: dia });
      continue;
    }

    const step = ring.perimeter / holesForRing;
    let traveled = 0;
    let nextEmit = 0;
    let emitted = 0;
    for (let i = 0; i < ring.points.length && emitted < holesForRing; i++) {
      const [x1, y1] = ring.points[i];
      const [x2, y2] = ring.points[(i + 1) % ring.points.length];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const segEnd = traveled + segLen;
      while (nextEmit < segEnd && emitted < holesForRing) {
        const t = (nextEmit - traveled) / segLen;
        holes.push({
          x: x1 + t * (x2 - x1),
          y: y1 + t * (y2 - y1),
          diameter: dia,
        });
        nextEmit += step;
        emitted += 1;
      }
      traveled = segEnd;
    }
  }
  return { holes };
}
