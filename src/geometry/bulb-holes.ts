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

  // Ring walk goes here in the next task. Return [] for now so the
  // disabled/empty/collapsed contracts are testable on their own.
  outer.delete();
  cavity.delete();
  centerline.delete();
  return { holes: [] };
}
