import { getManifold } from "./manifold-init";
import type { CableHole } from "./cable-holes";
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
  mounts?: MountPlan;
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
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-lipWidth, "Round");

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
      // Z-cylinder centered at origin: length high, radius = diameter/2,
      // both end-caps with the same radius, default circular segments,
      // centered=true so it spans -length/2 to +length/2 along Z.
      const cyl = Manifold.cylinder(hole.length, hole.diameter / 2, hole.diameter / 2, undefined, true);
      // Rotate 90° around Y axis to align the cylinder axis with the X axis.
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

  if (input.mounts && (input.mounts.slots.length > 0 || input.mounts.tabs.length > 0)) {
    const { Manifold } = m;

    // 1. UNION tabs (open-back only — flat-back has empty tabs array).
    // Each tab is clipped to the letter's outer outline (intersect with
    // outerPrism) before unioning, so the tab follows the actual letter
    // shape across its full Y range — never sticks out where the outline
    // is narrower than slice.minX/maxX at the slot's Y.
    for (const tab of input.mounts.tabs) {
      const tabSize: [number, number, number] = [
        tab.maxX - tab.minX,
        tab.maxY - tab.minY,
        tab.zTop - tab.zBottom,
      ];
      // Manifold.cube(size, false): one corner at origin, opposite at +size.
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

    // 2. SUBTRACT keyhole through-holes.
    // Keyhole always sits at the very back: through the back panel for
    // flat-back letters, through the union'd tabs for open-back letters.
    // Z ∈ [0, backThickness].
    //
    // The keyhole shape is: head circle at the bottom + narrow slot box +
    // small rounded top circle, so both ends of the slot are rounded —
    // a stadium with a wider head bulb at the bottom.
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
  // Copy typed array views into owned arrays before any .delete() calls;
  // the views returned by getMesh() are windows into the WASM heap and
  // become unsafe to read once the manifold object is destroyed.
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
    out[i + 2] = v[i + 2]; // Z = 0 at the lowest face from buildLetterShell's extrusion
  }
  return {
    vertProperties: out,
    triVerts: mesh.triVerts,
    bbox: { minX, minY, maxX, maxY },
  };
}
