import opentype from "opentype.js";
import type { GlyphContours, Polygon } from "./types";

/**
 * Flatten an opentype glyph into closed polygons in font units (NOT scaled).
 * Y is flipped so positive Y is up.
 * tolerance is the maximum chord deviation from the true bezier curve (in mm,
 * converted internally to font units via unitsPerEm).
 *
 * Outer contours emerge CCW, holes CW.
 */
export function flattenGlyph(
  glyph: opentype.Glyph,
  unitsPerEm: number,
  toleranceMm: number,
): GlyphContours {
  // Convert mm tolerance to font-unit tolerance. We assume the glyph will be
  // scaled to roughly 100mm cap height downstream; unitsPerEm/100 is the
  // font-units-per-mm factor used for chord-deviation tolerance.
  const toleranceFu = (toleranceMm / 1) * (unitsPerEm / 100);

  const path = glyph.getPath(0, 0, unitsPerEm);
  const contours: Polygon[] = [];
  let current: Polygon = [];
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;

  const flipY = (y: number) => -y;

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case "M": {
        if (current.length > 0) contours.push(closeIfNeeded(current));
        current = [];
        startX = cmd.x;
        startY = cmd.y;
        lastX = cmd.x;
        lastY = cmd.y;
        current.push([cmd.x, flipY(cmd.y)]);
        break;
      }
      case "L": {
        current.push([cmd.x, flipY(cmd.y)]);
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "Q": {
        flattenQuadratic(
          current,
          lastX,
          lastY,
          cmd.x1,
          cmd.y1,
          cmd.x,
          cmd.y,
          toleranceFu,
          flipY,
        );
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "C": {
        flattenCubic(
          current,
          lastX,
          lastY,
          cmd.x1,
          cmd.y1,
          cmd.x2,
          cmd.y2,
          cmd.x,
          cmd.y,
          toleranceFu,
          flipY,
        );
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "Z": {
        if (current.length > 0) contours.push(closeIfNeeded(current));
        current = [];
        lastX = startX;
        lastY = startY;
        break;
      }
    }
  }
  if (current.length > 0) contours.push(closeIfNeeded(current));

  return correctWinding(contours);
}

function closeIfNeeded(poly: Polygon): Polygon {
  if (poly.length === 0) return poly;
  const [fx, fy] = poly[0];
  const [lx, ly] = poly[poly.length - 1];
  if (fx === lx && fy === ly) return poly.slice(0, -1);
  return poly;
}

function flattenQuadratic(
  out: Polygon,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tol: number,
  flipY: (y: number) => number,
) {
  const stack: [number, number, number, number, number, number, number][] = [
    [x0, y0, x1, y1, x2, y2, 0],
  ];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy, depth] = stack.pop()!;
    const dev = pointLineDistance(bx, by, ax, ay, cx, cy);
    if (dev <= tol || depth > 16) {
      out.push([cx, flipY(cy)]);
    } else {
      const mAx = (ax + bx) / 2,
        mAy = (ay + by) / 2;
      const mBx = (bx + cx) / 2,
        mBy = (by + cy) / 2;
      const mx = (mAx + mBx) / 2,
        my = (mAy + mBy) / 2;
      stack.push([mx, my, mBx, mBy, cx, cy, depth + 1]);
      stack.push([ax, ay, mAx, mAy, mx, my, depth + 1]);
    }
  }
}

function flattenCubic(
  out: Polygon,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  tol: number,
  flipY: (y: number) => number,
) {
  const stack: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ][] = [[x0, y0, x1, y1, x2, y2, x3, y3, 0]];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy, dx, dy, depth] = stack.pop()!;
    const d1 = pointLineDistance(bx, by, ax, ay, dx, dy);
    const d2 = pointLineDistance(cx, cy, ax, ay, dx, dy);
    if (Math.max(d1, d2) <= tol || depth > 16) {
      out.push([dx, flipY(dy)]);
    } else {
      const m1x = (ax + bx) / 2,
        m1y = (ay + by) / 2;
      const m2x = (bx + cx) / 2,
        m2y = (by + cy) / 2;
      const m3x = (cx + dx) / 2,
        m3y = (cy + dy) / 2;
      const m12x = (m1x + m2x) / 2,
        m12y = (m1y + m2y) / 2;
      const m23x = (m2x + m3x) / 2,
        m23y = (m2y + m3y) / 2;
      const mx = (m12x + m23x) / 2,
        my = (m12y + m23y) / 2;
      stack.push([mx, my, m23x, m23y, m3x, m3y, dx, dy, depth + 1]);
      stack.push([ax, ay, m1x, m1y, m12x, m12y, mx, my, depth + 1]);
    }
  }
}

function pointLineDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const cross = Math.abs(dx * (ay - py) - dy * (ax - px));
  return cross / Math.sqrt(len2);
}

/**
 * Determine outer/hole status by point-in-polygon parity, then force CCW for
 * outers and CW for holes (in the y-up coordinate system used after flipY).
 *
 * Signed area in y-up: shoelace gives positive area for CCW, negative for CW.
 * The test fixture uses the (x2-x1)*(y2+y1) form which is the inverse: positive
 * for CW, negative for CCW. We use proper shoelace here and align orientation
 * accordingly: outer => positive shoelace area => CCW; hole => negative.
 */
function correctWinding(contours: Polygon[]): Polygon[] {
  return contours.map((poly, i) => {
    let inside = 0;
    const [px, py] = poly[0];
    for (let j = 0; j < contours.length; j++) {
      if (j === i) continue;
      if (pointInPolygon(px, py, contours[j])) inside++;
    }
    const isHole = inside % 2 === 1;
    const area = shoelace(poly); // y-up: > 0 CCW, < 0 CW
    if (isHole && area > 0) return [...poly].reverse();
    if (!isHole && area < 0) return [...poly].reverse();
    return poly;
  });
}

function shoelace(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
