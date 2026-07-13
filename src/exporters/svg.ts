import { getManifold } from "../geometry/manifold-init";
import type { GlyphContours } from "../geometry/types";

export type Point = [number, number];
export type Polygon = Point[];

export function polygonsToSVG(polys: Polygon[], opts: { margin: number }): string {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const m = opts.margin;
  const x0 = minX - m,
    y0 = minY - m;
  const w = maxX - minX + 2 * m;
  const h = maxY - minY + 2 * m;

  const paths = polys
    .map((poly) => {
      if (poly.length === 0) return "";
      const [[fx, fy], ...rest] = poly;
      const segs = [`M ${fx} ${fy}`, ...rest.map(([x, y]) => `L ${x} ${y}`), "Z"];
      return segs.join(" ");
    })
    .filter((p) => p.length > 0)
    .join(" ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" `,
    `viewBox="${x0} ${y0} ${w} ${h}" `,
    `width="${w}mm" height="${h}mm">`,
    `<path d="${paths}" fill="none" stroke="black" stroke-width="0.001" />`,
    `</svg>`,
  ].join("");
}

export type LetterLayers = {
  back: Polygon[]; // = outer
  wall: Polygon[]; // = outer ∖ cavity
  rabbet: Polygon[]; // = outer ∖ rabbetCut
  plexi: Polygon[]; // = rabbetCut
};

export type LayerInputs = {
  contours: GlyphContours;
  wallThickness: number;
  insetWidth: number; // shelf width; lip = wallThickness − insetWidth
  plexiTolerance: number;
  // Sliced cavity/plexi (full parent intersected with strip). Same role as in
  // ShellInputs — keeps the rendered plexi SVG open at cut edges.
  cavityContours?: GlyphContours;
  plexiContours?: GlyphContours;
};

export async function buildLetterLayers(input: LayerInputs): Promise<LetterLayers | null> {
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const lipWidth = input.wallThickness - input.insetWidth;
  const cavity = input.cavityContours
    ? new CrossSection(input.cavityContours, "NonZero")
    : outer.offset(-input.wallThickness, "Round");
  const rabbetCut = input.plexiContours
    ? new CrossSection(input.plexiContours, "NonZero")
    : outer.offset(-(lipWidth + input.plexiTolerance), "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return null;
  }

  const wall = outer.subtract(cavity);
  const rabbet = outer.subtract(rabbetCut);

  const result: LetterLayers = {
    back: outer.toPolygons() as Polygon[],
    wall: wall.toPolygons() as Polygon[],
    rabbet: rabbet.toPolygons() as Polygon[],
    plexi: rabbetCut.toPolygons() as Polygon[],
  };

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  wall.delete();
  rabbet.delete();
  return result;
}
