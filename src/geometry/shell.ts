import { getManifold } from "./manifold-init";
import type { GlyphContours } from "./types";

export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  rabbetLipWidth: number;
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
  const rabbetCut = outer.offset(-input.rabbetLipWidth, "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return { ok: false, reason: "offset_collapsed" };
  }

  const outerPrism = outer.extrude(input.totalDepth);
  const cavityPrism = cavity
    .extrude(input.totalDepth - input.backThickness)
    .translate([0, 0, input.backThickness]);
  const rabbetPrism = rabbetCut
    .extrude(input.rabbetDepth)
    .translate([0, 0, input.totalDepth - input.rabbetDepth]);

  const shell = outerPrism.subtract(cavityPrism).subtract(rabbetPrism);
  const mesh = shell.getMesh();

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  outerPrism.delete();
  cavityPrism.delete();
  rabbetPrism.delete();
  shell.delete();

  return {
    ok: true,
    mesh: {
      vertProperties: mesh.vertProperties,
      triVerts: mesh.triVerts,
    },
  };
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
