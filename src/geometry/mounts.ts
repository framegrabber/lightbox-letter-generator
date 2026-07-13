import { xExtentAtY } from "./cable-holes";
import type { GlyphContours } from "./types";
import type { OuterEdges } from "./slice";

export type MountSlot = {
  x: number;
  y: number;
  shankDiameter: number;
  headDiameter: number;
  slotLength: number;
};

export type MountTab = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zBottom: number;
  zTop: number;
};

export type MountPlan = {
  slots: MountSlot[];
  tabs: MountTab[];
};

export type MountParams = {
  mountShankDiameter: number;
  mountSlotY: number;
  mountSlotXInset: number;
  wallThickness: number;
  backThickness: number;
  backCavityDepth: number;
  outerEdges?: OuterEdges;
};

// Slot positions are derived from the X-extent of letter material AT mountSlotY,
// not the overall bbox. Tapering letters (V, A) have a wide bbox but narrow
// material at high Y, so a bbox-based slot would land in air. The slice picks
// the actual wall positions at the slot's Y.
//
// Tabs (open-back only) and the keyhole both sit at Z ∈ [0, backThickness] —
// at the very rear of the letter. The user mounts the letter on a wall, the
// screw protrudes from the wall by a few mm, the screw shank rides through
// the keyhole at Z=0, and the head is captured behind the tab/back panel.
// For open-back letters the tab fills the gap that the open rear cavity
// would otherwise leave; the tab's X span reaches back to the slice edge so
// it fuses with the perimeter wall material at slotY.
export function computeMounts(
  mergedContours: GlyphContours,
  params: MountParams,
): MountPlan {
  if (params.mountShankDiameter <= 0) {
    return { slots: [], tabs: [] };
  }

  const slice = xExtentAtY(mergedContours, params.mountSlotY);
  if (!slice) {
    return { slots: [], tabs: [] };
  }

  const shank = params.mountShankDiameter;
  const head = 2 * shank;
  const slotLength = 2 * shank;
  const y = params.mountSlotY;

  const leftSlotX = slice.minX + params.mountSlotXInset;
  const rightSlotX = slice.maxX - params.mountSlotXInset;

  const slots: MountSlot[] = [];
  if (params.outerEdges?.left !== false) {
    slots.push({
      x: leftSlotX,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    });
  }
  if (params.outerEdges?.right !== false) {
    slots.push({
      x: rightSlotX,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    });
  }

  if (params.backCavityDepth <= 0) {
    return { slots, tabs: [] };
  }

  // Tab XY brackets the keyhole shape with a 2mm margin and reaches back to
  // the slice edge so it fuses with the perimeter wall at slotY (no floating
  // geometry, no separate piece).
  // Keyhole Y extent: [y − slotLength − headDiameter/2, y]
  // Tab Y extent: [y − slotLength − head/2 − 2, y + 2]
  const halfHead = head / 2;
  const tabMinY = y - slotLength - halfHead - 2;
  const tabMaxY = y + 2;
  const eps = 0.01;
  const tabs: MountTab[] = [];

  if (params.outerEdges?.left !== false) {
    tabs.push({
      minX: slice.minX - eps,
      maxX: leftSlotX + halfHead + 2,
      minY: tabMinY,
      maxY: tabMaxY,
      zBottom: 0,
      zTop: params.backThickness,
    });
  }
  if (params.outerEdges?.right !== false) {
    tabs.push({
      minX: rightSlotX - halfHead - 2,
      maxX: slice.maxX + eps,
      minY: tabMinY,
      maxY: tabMaxY,
      zBottom: 0,
      zTop: params.backThickness,
    });
  }

  return { slots, tabs };
}
