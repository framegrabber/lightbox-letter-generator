import type { GlyphContours } from "./types";

export type CableHole = {
  x: number;
  y: number;
  z: number;
  diameter: number;
  length: number;
};

// Structural sub-type of LayoutEntry — we only need these two fields.
// Lets tests construct fixture layouts without depending on opentype.Glyph.
export type CableHoleLayoutInput = {
  originalIndex: number;
  xOffset: number;
};

export type CableHoleParams = {
  cableHoleDiameter: number;
  cableHoleY: number;
  cableHoleZ: number;
  cableHoleAtEnds: boolean;
  wallThickness: number;
};

type Bbox = { minX: number; maxX: number };

export function computeCableHoles(
  layout: CableHoleLayoutInput[],
  glyphContours: Map<number, GlyphContours>,
  params: CableHoleParams,
): CableHole[] {
  if (params.cableHoleDiameter <= 0) return [];
  if (layout.length === 0) return [];

  // Per-entry word-space X bbox. null when the contour map has no entry.
  const bboxes: (Bbox | null)[] = layout.map((entry) => {
    const contours = glyphContours.get(entry.originalIndex);
    if (!contours || contours.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const poly of contours) {
      for (const [x] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    return { minX: minX + entry.xOffset, maxX: maxX + entry.xOffset };
  });

  const holes: CableHole[] = [];
  const yzd = {
    y: params.cableHoleY,
    z: params.cableHoleZ,
    diameter: params.cableHoleDiameter,
  };
  const wt = params.wallThickness;

  // Internal boundary cylinders between adjacent non-space letter pairs.
  for (let i = 0; i + 1 < layout.length; i++) {
    if (layout[i + 1].originalIndex - layout[i].originalIndex !== 1) continue;
    const a = bboxes[i];
    const b = bboxes[i + 1];
    if (!a || !b) continue;
    const gap = b.minX - a.maxX;
    const x = (a.maxX + b.minX) / 2;
    const length = Math.max(Math.abs(gap) + 4 * wt, 4 * wt);
    holes.push({ x, ...yzd, length });
  }

  // Power-entry cylinders at the outer ends.
  if (params.cableHoleAtEnds) {
    const valid = bboxes.filter((b): b is Bbox => b !== null);
    if (valid.length > 0) {
      const first = valid[0];
      const last = valid[valid.length - 1];
      const endLength = 4 * wt;
      holes.push({ x: first.minX, ...yzd, length: endLength });
      holes.push({ x: last.maxX, ...yzd, length: endLength });
    }
  }

  return holes;
}
