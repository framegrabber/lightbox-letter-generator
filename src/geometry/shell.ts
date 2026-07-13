import { getManifold } from "./manifold-init";
import type { CableHole } from "./cable-holes";
import type { BulbHole } from "./bulb-holes";
import type { MountPlan } from "./mounts";
import type { GlyphContours } from "./types";

export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  insetWidth: number; // shelf width where the plexi rests; lip = wallThickness − insetWidth
  backCavityDepth: number; // hollow cavity behind the back panel; 0 = today's flat-back behavior
  cableHoles?: ReadonlyArray<CableHole>;
  bulbHoles?: ReadonlyArray<BulbHole>;
  mounts?: MountPlan;
  // For sliced pieces: cavity/rabbet of the FULL parent intersected with the
  // strip. When passed, used as-is so the cavity reaches cut edges and the
  // butt-joint channel stays open. Without them, both are offset from
  // `contours`, which would seal the cavity at cuts.
  cavityContours?: GlyphContours;
  rabbetContours?: GlyphContours;
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
  const lipWidth = input.wallThickness - input.insetWidth;
  const cavity =
    input.cavityContours
      ? new CrossSection(input.cavityContours, "NonZero")
      : outer.offset(-input.wallThickness, "Round");
  const rabbetCut =
    input.rabbetContours
      ? new CrossSection(input.rabbetContours, "NonZero")
      : outer.offset(-lipWidth, "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return { ok: false, reason: "offset_collapsed" };
  }

  // Coordinate system: Z=0 is the lowest face (open back when backCavityDepth>0,
  // back panel when backCavityDepth=0). Z=top is the front face.
  const top = input.totalDepth + input.backCavityDepth;

  const outerPrism = outer.extrude(top);

  // Front cavity: above the internal panel, up to the front face.
  const frontCavityHeight = top - (input.backCavityDepth + input.backThickness);
  const frontCavityExtruded = cavity.extrude(frontCavityHeight);
  const frontCavityPrism = frontCavityExtruded.translate([
    0,
    0,
    input.backCavityDepth + input.backThickness,
  ]);

  // Rabbet step at the front face.
  const rabbetExtruded = rabbetCut.extrude(input.rabbetDepth);
  const rabbetPrism = rabbetExtruded.translate([0, 0, top - input.rabbetDepth]);

  // Always-present subtractions.
  const shellMinusFrontCavity = outerPrism.subtract(frontCavityPrism);
  const shellNoRear = shellMinusFrontCavity.subtract(rabbetPrism);
  shellMinusFrontCavity.delete();

  // Conditional rear cavity (skip the allocation entirely when backCavityDepth = 0).
  let shell: typeof shellNoRear;
  if (input.backCavityDepth > 0) {
    const rearCavityPrism = cavity.extrude(input.backCavityDepth);
    shell = shellNoRear.subtract(rearCavityPrism);
    shellNoRear.delete();
    rearCavityPrism.delete();
  } else {
    shell = shellNoRear;
  }

  if (input.cableHoles && input.cableHoles.length > 0) {
    const { Manifold } = m;
    for (const hole of input.cableHoles) {
      if (hole.diameter <= 0) continue;
      const cyl = Manifold.cylinder(hole.length, hole.diameter / 2, hole.diameter / 2, undefined, true);
      const cylX = cyl.rotate([0, 90, 0]);
      const cylPositioned = cylX.translate([hole.x, hole.y, hole.z]);
      const newShell = shell.subtract(cylPositioned);
      cyl.delete();
      cylX.delete();
      cylPositioned.delete();
      shell.delete();
      shell = newShell;
    }
  }

  if (input.bulbHoles && input.bulbHoles.length > 0) {
    const { Manifold } = m;
    const eps = 0.01;
    const length = input.backThickness + 2 * eps;
    const centerZ = input.backCavityDepth + input.backThickness / 2;
    for (const hole of input.bulbHoles) {
      if (hole.diameter <= 0) continue;
      const cyl = Manifold.cylinder(length, hole.diameter / 2, hole.diameter / 2, undefined, true);
      const positioned = cyl.translate([hole.x, hole.y, centerZ]);
      const newShell = shell.subtract(positioned);
      cyl.delete();
      positioned.delete();
      shell.delete();
      shell = newShell;
    }
  }

  if (input.mounts && (input.mounts.slots.length > 0 || input.mounts.tabs.length > 0)) {
    const { Manifold } = m;

    for (const tab of input.mounts.tabs) {
      const tabSize: [number, number, number] = [
        tab.maxX - tab.minX,
        tab.maxY - tab.minY,
        tab.zTop - tab.zBottom,
      ];
      const tabBox = Manifold.cube(tabSize, false);
      const tabPositioned = tabBox.translate([tab.minX, tab.minY, tab.zBottom]);
      const tabClipped = tabPositioned.intersect(outerPrism);
      const newShell = shell.add(tabClipped);
      tabBox.delete();
      tabPositioned.delete();
      tabClipped.delete();
      shell.delete();
      shell = newShell;
    }

    const keyholeHeight = input.backThickness;
    const keyholeCenterZ = input.backThickness / 2;

    for (const slot of input.mounts.slots) {
      const halfHead = slot.headDiameter / 2;
      const halfShank = slot.shankDiameter / 2;
      const headCenterY = slot.y - slot.slotLength;
      const slotMidY = slot.y - slot.slotLength / 2;

      const head = Manifold.cylinder(keyholeHeight, halfHead, halfHead, undefined, true);
      const headPos = head.translate([slot.x, headCenterY, keyholeCenterZ]);
      const slotTop = Manifold.cylinder(keyholeHeight, halfShank, halfShank, undefined, true);
      const slotTopPos = slotTop.translate([slot.x, slot.y, keyholeCenterZ]);
      const slotBox = Manifold.cube(
        [slot.shankDiameter, slot.slotLength, keyholeHeight],
        true,
      );
      const slotBoxPos = slotBox.translate([slot.x, slotMidY, keyholeCenterZ]);
      const headPlusSlot = headPos.add(slotBoxPos);
      const keyhole = headPlusSlot.add(slotTopPos);

      const newShell = shell.subtract(keyhole);
      head.delete(); headPos.delete();
      slotTop.delete(); slotTopPos.delete();
      slotBox.delete(); slotBoxPos.delete();
      headPlusSlot.delete(); keyhole.delete();
      shell.delete();
      shell = newShell;
    }
  }

  const mesh = shell.getMesh();
  const vertProperties = mesh.vertProperties.slice();
  const triVerts = mesh.triVerts.slice();

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  outerPrism.delete();
  frontCavityExtruded.delete();
  frontCavityPrism.delete();
  rabbetExtruded.delete();
  rabbetPrism.delete();
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
  backCavityDepth: number;
  // Sliced plexi cutout — full parent's plexi offset, intersected with the
  // strip. Same rationale as ShellInputs.cavityContours: keep the rabbet
  // open to the cut edge so two pieces' inserts butt cleanly.
  plexiContours?: GlyphContours;
};

export async function buildLetterPlexi(input: PlexiInputs): Promise<{ vertProperties: Float32Array; triVerts: Uint32Array } | null> {
  if (input.contours.length === 0) return null;
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = input.plexiContours
    ? new CrossSection(input.plexiContours, "NonZero")
    : outer.offset(-(lipWidth + input.plexiTolerance), "Round");

  if (rabbetCut.isEmpty()) {
    outer.delete();
    rabbetCut.delete();
    return null;
  }

  const top = input.totalDepth + input.backCavityDepth;
  const extruded = rabbetCut.extrude(input.rabbetDepth);
  const positioned = extruded.translate([0, 0, top - input.rabbetDepth]);
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
    out[i + 2] = v[i + 2];
  }
  return {
    vertProperties: out,
    triVerts: mesh.triVerts,
    bbox: { minX, minY, maxX, maxY },
  };
}