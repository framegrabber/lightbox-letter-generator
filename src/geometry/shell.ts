import { getManifold } from "./manifold-init";
import type { GlyphContours } from "./types";

export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  insetWidth: number; // shelf width where the plexi rests; lip = wallThickness − insetWidth
};

export type ShellMeshResult =
  | {
      ok: true;
      mesh: { vertProperties: Float32Array; triVerts: Uint32Array };
    }
  | { ok: false; reason: "offset_collapsed" | "no_contours" };

export async function buildLetterShell(input: ShellInputs): Promise<ShellMeshResult> {
  if (input.contours.length === 0) {
    return { ok: false, reason: "no_contours" };
  }

  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const cavity = outer.offset(-input.wallThickness, "Round");
  // The rabbet polygon is offset inward by the lip width (wall − shelf).
  // insetWidth is the shelf where plexi rests; the lip is whatever is left
  // of the wall after carving out that shelf.
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-lipWidth, "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return { ok: false, reason: "offset_collapsed" };
  }

  const outerPrism = outer.extrude(input.totalDepth);

  const cavityExtruded = cavity.extrude(input.totalDepth - input.backThickness);
  const cavityPrism = cavityExtruded.translate([0, 0, input.backThickness]);

  const rabbetExtruded = rabbetCut.extrude(input.rabbetDepth);
  const rabbetPrism = rabbetExtruded.translate([0, 0, input.totalDepth - input.rabbetDepth]);

  const shellMinusCavity = outerPrism.subtract(cavityPrism);
  const shell = shellMinusCavity.subtract(rabbetPrism);

  const mesh = shell.getMesh();
  // Copy typed array views into owned arrays before any .delete() calls;
  // the views returned by getMesh() are windows into the WASM heap and
  // become unsafe to read once the manifold object is destroyed.
  const vertProperties = mesh.vertProperties.slice();
  const triVerts = mesh.triVerts.slice();

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  outerPrism.delete();
  cavityExtruded.delete();
  cavityPrism.delete();
  rabbetExtruded.delete();
  rabbetPrism.delete();
  shellMinusCavity.delete();
  shell.delete();

  return {
    ok: true,
    mesh: { vertProperties, triVerts },
  };
}

export type PlexiInputs = {
  contours: GlyphContours;
  totalDepth: number;
  rabbetDepth: number;
  wallThickness: number;
  insetWidth: number;
  plexiTolerance: number;
};

// Standalone mesh of just the plexi piece — same XY shape as the rabbet
// cutout, shrunk inward by `plexiTolerance` so the printed or cut insert
// drops into the recess. Extruded by rabbetDepth, positioned to sit flush.
// Returns null if the inset cutout collapses for this glyph.
export async function buildLetterPlexi(input: PlexiInputs): Promise<{ vertProperties: Float32Array; triVerts: Uint32Array } | null> {
  if (input.contours.length === 0) return null;
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-(lipWidth + input.plexiTolerance), "Round");

  if (rabbetCut.isEmpty()) {
    outer.delete();
    rabbetCut.delete();
    return null;
  }

  const extruded = rabbetCut.extrude(input.rabbetDepth);
  const positioned = extruded.translate([0, 0, input.totalDepth - input.rabbetDepth]);
  const mesh = positioned.getMesh();
  const vertProperties = mesh.vertProperties.slice();
  const triVerts = mesh.triVerts.slice();

  outer.delete();
  rabbetCut.delete();
  extruded.delete();
  positioned.delete();
  return { vertProperties, triVerts };
}

export function centerMeshXY(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }): {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const v = mesh.vertProperties;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    if (v[i] < minX) minX = v[i];
    if (v[i] > maxX) maxX = v[i];
    if (v[i + 1] < minY) minY = v[i + 1];
    if (v[i + 1] > maxY) maxY = v[i + 1];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    out[i] = v[i] - cx;
    out[i + 1] = v[i + 1] - cy;
    out[i + 2] = v[i + 2]; // Z = 0 at back already from extrusion
  }
  return {
    vertProperties: out,
    triVerts: mesh.triVerts,
    bbox: { minX, minY, maxX, maxY },
  };
}
