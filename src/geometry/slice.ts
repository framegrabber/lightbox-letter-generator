import { getManifold } from "./manifold-init";
import type { GlyphContours } from "./types";
import type { Component, ComponentMember } from "./merge";
import type { Cut } from "../state/parameters";

export type OuterEdges = { left: boolean; right: boolean };

export type SliceWarning =
  | { kind: "slice_empty"; componentMembers: ComponentMember[]; sliceIndex: number }
  | { kind: "slice_crossed"; cuts: [number, number] }
  | { kind: "slice_oversize"; componentMembers: ComponentMember[]; sliceIndex: number; width: number }
  | { kind: "slice_recommended"; componentMembers: ComponentMember[] };

// When passed, sliceComponent additionally pre-slices the cavity/rabbet/plexi
// offsets so shell-building skips re-offsetting the sliced outer. This is what
// keeps the channel OPEN at cut edges — see CLAUDE.md "Slicing" section.
export type SliceOffsetParams = {
  wallThickness: number;
  insetWidth: number;
  plexiTolerance: number;
};

export type SlicedPiece = Component & {
  sliceIndex: number;
  totalSlices: number;
  // Present only when sliceComponent was called with offsetParams. The cavity
  // and rabbet of the FULL parent component, intersected with this piece's
  // strip — so their boundaries reach the cut edge rather than sitting
  // `wallThickness`/`lipWidth` inside it.
  cavityContours?: GlyphContours;
  rabbetContours?: GlyphContours;
  plexiContours?: GlyphContours;
};

export function suggestCuts(
  wordBBox: { minX: number; maxX: number },
  maxPieceWidth: number,
): Cut[] {
  if (maxPieceWidth <= 0 || wordBBox.maxX - wordBBox.minX <= maxPieceWidth) {
    return [];
  }
  const n = Math.ceil((wordBBox.maxX - wordBBox.minX) / maxPieceWidth);
  const cuts: Cut[] = [];
  for (let i = 1; i < n; i++) {
    cuts.push({ x: wordBBox.minX + i * (wordBBox.maxX - wordBBox.minX) / n, angle: 0 });
  }
  return cuts;
}

export async function sliceComponent(
  component: Component,
  cuts: Cut[],
  maxPieceWidth: number,
  offsetParams?: SliceOffsetParams,
): Promise<{
  pieces: SlicedPiece[];
  outerEdges: OuterEdges[];
  warnings: SliceWarning[];
}> {
  const { minX, maxX, minY, maxY } = component.bbox;
  const warnings: SliceWarning[] = [];

  // Filter cuts whose x lies strictly within (minX, maxX)
  const validCuts = cuts.filter((c) => c.x > minX && c.x < maxX);

  if (validCuts.length === 0) {
    if (maxPieceWidth > 0 && maxX - minX > maxPieceWidth) {
      warnings.push({ kind: "slice_recommended", componentMembers: component.members });
    }
    return {
      pieces: [{ ...component, sliceIndex: 1, totalSlices: 1 }],
      outerEdges: [{ left: true, right: true }],
      warnings,
    };
  }

  validCuts.sort((a, b) => a.x - b.x);

  const m = await getManifold();
  const { CrossSection } = m;

  const toX = (c: Cut, y: number) => c.x + y * Math.tan((c.angle * Math.PI) / 180);

  // Detect crossing cuts inside the bbox Y range
  for (let i = 0; i < validCuts.length; i++) {
    for (let j = i + 1; j < validCuts.length; j++) {
      const c1 = validCuts[i];
      const c2 = validCuts[j];
      const d1 = toX(c1, minY) - toX(c2, minY);
      const d2 = toX(c1, maxY) - toX(c2, maxY);
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
        warnings.push({ kind: "slice_crossed", cuts: [i, j] });
      }
    }
  }

  const margin = Math.max(maxX - minX, maxY - minY, 1000);
  const stripMinX = minX - margin;
  const stripMaxX = maxX + margin;
  const stripMinY = minY - margin;
  const stripMaxY = maxY + margin;

  const n = validCuts.length;
  const pieces: SlicedPiece[] = [];

  const compCS = new CrossSection(component.mergedContours, "NonZero");

  // Pre-compute the FULL component's cavity/rabbet/plexi offsets ONCE. We
  // intersect each per-piece strip with these to get the sliced cavity etc.
  // — instead of letting shell.ts re-offset the sliced outer, which would
  // place a wall between the cavity and the cut edge.
  let fullCavityCS: ReturnType<typeof compCS.offset> | null = null;
  let fullRabbetCS: ReturnType<typeof compCS.offset> | null = null;
  let fullPlexiCS: ReturnType<typeof compCS.offset> | null = null;
  if (offsetParams) {
    const lipWidth = offsetParams.wallThickness - offsetParams.insetWidth;
    fullCavityCS = compCS.offset(-offsetParams.wallThickness, "Round");
    fullRabbetCS = compCS.offset(-lipWidth, "Round");
    fullPlexiCS = compCS.offset(-(lipWidth + offsetParams.plexiTolerance), "Round");
  }

  for (let k = 0; k <= n; k++) {
    const L0 = k === 0 ? stripMinX : toX(validCuts[k - 1], stripMinY);
    const L1 = k === 0 ? stripMinX : toX(validCuts[k - 1], stripMaxY);
    const R0 = k === n ? stripMaxX : toX(validCuts[k], stripMinY);
    const R1 = k === n ? stripMaxX : toX(validCuts[k], stripMaxY);

    const stripPoly: GlyphContours = [
      [
        [L0, stripMinY],
        [R0, stripMinY],
        [R1, stripMaxY],
        [L1, stripMaxY],
      ],
    ];

    const stripCS = new CrossSection(stripPoly, "NonZero");
    const pieceCS = compCS.intersect(stripCS);

    if (pieceCS.area() < 0.5) {
      warnings.push({
        kind: "slice_empty",
        componentMembers: component.members,
        sliceIndex: k + 1,
      });
      stripCS.delete();
      pieceCS.delete();
      continue;
    }

    const piecePolys = pieceCS.toPolygons() as GlyphContours;

    let pMinX = Infinity;
    let pMinY = Infinity;
    let pMaxX = -Infinity;
    let pMaxY = -Infinity;
    for (const poly of piecePolys) {
      for (const [x, y] of poly) {
        if (x < pMinX) pMinX = x;
        if (x > pMaxX) pMaxX = x;
        if (y < pMinY) pMinY = y;
        if (y > pMaxY) pMaxY = y;
      }
    }

    if (maxPieceWidth > 0 && pMaxX - pMinX > maxPieceWidth) {
      warnings.push({
        kind: "slice_oversize",
        componentMembers: component.members,
        sliceIndex: k + 1,
        width: pMaxX - pMinX,
      });
    }

    let pieceCavity: GlyphContours | undefined;
    let pieceRabbet: GlyphContours | undefined;
    let piecePlexi: GlyphContours | undefined;
    if (fullCavityCS && fullRabbetCS && fullPlexiCS) {
      const cavSlice = fullCavityCS.intersect(stripCS);
      const rabSlice = fullRabbetCS.intersect(stripCS);
      const plxSlice = fullPlexiCS.intersect(stripCS);
      pieceCavity = cavSlice.toPolygons() as GlyphContours;
      pieceRabbet = rabSlice.toPolygons() as GlyphContours;
      piecePlexi = plxSlice.toPolygons() as GlyphContours;
      cavSlice.delete();
      rabSlice.delete();
      plxSlice.delete();
    }

    pieces.push({
      members: component.members,
      mergedContours: piecePolys,
      bbox: { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY },
      sliceIndex: k + 1,
      totalSlices: 0, // filled below
      cavityContours: pieceCavity,
      rabbetContours: pieceRabbet,
      plexiContours: piecePlexi,
    });

    stripCS.delete();
    pieceCS.delete();
  }

  compCS.delete();
  if (fullCavityCS) fullCavityCS.delete();
  if (fullRabbetCS) fullRabbetCS.delete();
  if (fullPlexiCS) fullPlexiCS.delete();

  const finalTotal = pieces.length;
  for (const p of pieces) {
    p.totalSlices = finalTotal;
  }

  const outerEdges: OuterEdges[] = [];
  for (let i = 0; i < pieces.length; i++) {
    outerEdges.push({
      left: i === 0,
      right: i === pieces.length - 1,
    });
  }

  return { pieces, outerEdges, warnings };
}
