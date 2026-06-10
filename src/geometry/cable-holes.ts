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

type XSpan = { minX: number; maxX: number };

// Returns the X-extent of a contour set sliced at horizontal line y, in glyph-local
// coords. Walls of letters that taper (V, U-bottom, A-apex) sit at very different
// X positions at different Y values; using the overall X-bbox would put a low cable
// hole at the wrong X. Slicing at the cable hole's actual Y gives the X positions
// of the walls the cylinder needs to pierce.
//
// Returns null when y is outside the contour's Y range (no material at that height).
export function xExtentAtY(contours: GlyphContours, y: number): XSpan | null {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const poly of contours) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      // Edge crosses (or touches) the horizontal line y, with the standard
      // half-open rule [min, max) to avoid double-counting at shared vertices.
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      if (y < yMin || y >= yMax) continue;
      // Linear interpolate X at y. y2 - y1 is non-zero because yMax > yMin (strict).
      const t = (y - y1) / (y2 - y1);
      const x = x1 + t * (x2 - x1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (minX === Infinity) return null;
  return { minX, maxX };
}

export function computeCableHoles(
  layout: CableHoleLayoutInput[],
  glyphContours: Map<number, GlyphContours>,
  params: CableHoleParams,
): CableHole[] {
  if (params.cableHoleDiameter <= 0) return [];
  if (layout.length === 0) return [];

  // Per-entry word-space X-extent at cableHoleY. null when the glyph has no
  // material at that height (or no contours at all).
  const spans: (XSpan | null)[] = layout.map((entry) => {
    const contours = glyphContours.get(entry.originalIndex);
    if (!contours || contours.length === 0) return null;
    const local = xExtentAtY(contours, params.cableHoleY);
    if (!local) return null;
    return { minX: local.minX + entry.xOffset, maxX: local.maxX + entry.xOffset };
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
    const a = spans[i];
    const b = spans[i + 1];
    if (!a || !b) continue;
    const gap = b.minX - a.maxX;
    const x = (a.maxX + b.minX) / 2;
    const length = Math.max(Math.abs(gap) + 4 * wt, 4 * wt);
    holes.push({ x, ...yzd, length });
  }

  // Power-entry cylinders at the outer ends.
  if (params.cableHoleAtEnds) {
    const valid = spans.filter((s): s is XSpan => s !== null);
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
