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
};

export function computeMounts(
  componentBBox: { minX: number; maxX: number; minY: number; maxY: number },
  params: MountParams,
): MountPlan {
  if (params.mountShankDiameter <= 0) {
    return { slots: [], tabs: [] };
  }

  const shank = params.mountShankDiameter;
  const head = 2 * shank;
  const slotLength = 4 * shank;
  const y = params.mountSlotY;

  const slots: MountSlot[] = [
    {
      x: componentBBox.minX + params.mountSlotXInset,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    },
    {
      x: componentBBox.maxX - params.mountSlotXInset,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    },
  ];

  if (params.backCavityDepth <= 0) {
    return { slots, tabs: [] };
  }

  // Tab XY brackets the keyhole shape with a 2mm margin on each side.
  // Keyhole Y extent: [y − slotLength − headDiameter/2, y]
  // Tab X extent per slot: [slot.x − head/2 − 2, slot.x + head/2 + 2]
  // Tab Y extent: [y − slotLength − head/2 − 2, y + 2]
  const halfHead = head / 2;
  const tabMinY = y - slotLength - halfHead - 2;
  const tabMaxY = y + 2;
  const zBottom = Math.max(0, params.backCavityDepth - params.backThickness);
  const zTop = params.backCavityDepth;

  const tabs: MountTab[] = slots.map((s) => ({
    minX: s.x - halfHead - 2,
    maxX: s.x + halfHead + 2,
    minY: tabMinY,
    maxY: tabMaxY,
    zBottom,
    zTop,
  }));

  return { slots, tabs };
}
