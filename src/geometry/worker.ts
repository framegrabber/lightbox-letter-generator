/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { layoutWord } from "./layout";
import { mergeIntoComponents } from "./merge";
import { computeCableHoles } from "./cable-holes";
import { computeMounts } from "./mounts";
import { computeBulbHoles } from "./bulb-holes";
import { sliceComponent } from "./slice";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { GlyphContours } from "./types";
import type { Parameters } from "../state/parameters";
import type {
  ComponentMesh,
  SlicedComponentMesh,
  ComponentLayers,
  ComponentError,
  MergeWarning,
  SliceWarning,
  WorkerResponse,
} from "./worker-client";

type WorkerRequest = {
  kind: "build";
  requestId: string;
  params: Parameters;
  fontBuffer: ArrayBuffer;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind !== "build") return;

  const font = opentype.parse(req.fontBuffer);
  const scale = capHeightScale(font, req.params.letterHeight);

  // Build a contour map keyed by the *original text index* (skipping spaces).
  const contoursByIndex = new Map<number, GlyphContours>();
  Array.from(req.params.text).forEach((ch, i) => {
    if (/\s/.test(ch)) return;
    const glyph = font.charToGlyph(ch);
    const raw = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const scaled = raw.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );
    contoursByIndex.set(i, scaled);
  });

  const layout = layoutWord(font, req.params.text, req.params.letterHeight, req.params.letterOverlap);

  const merged = await mergeIntoComponents(layout, contoursByIndex, {
    letterOverlap: req.params.letterOverlap,
    bridgeWidth: req.params.bridgeWidth,
    bridgeHeight: req.params.bridgeHeight,
    bridgeY: req.params.bridgeY,
  });

  const allCableHoles = computeCableHoles(layout, contoursByIndex, {
    cableHoleDiameter: req.params.cableHoleDiameter,
    cableHoleY: req.params.cableHoleY,
    cableHoleZ: req.params.cableHoleZ,
    cableHoleAtEnds: req.params.cableHoleAtEnds,
    wallThickness: req.params.wallThickness,
  });

  const components: ComponentMesh[] = [];
  const slicedComponents: SlicedComponentMesh[] = [];
  const layers: ComponentLayers[] = [];
  const slicedLayers: ComponentLayers[] = [];
  const errors: ComponentError[] = [];
  const warnings: (MergeWarning | SliceWarning)[] = merged.warnings;

  for (let parentIdx = 0; parentIdx < merged.components.length; parentIdx++) {
    const comp = merged.components[parentIdx];
    const memberRefs = comp.members.map((m) => ({ char: m.char, index: m.index }));
    const parentSlot = parentIdx + 1;

    // =========================================================================
    // PASS 1: BUILD FULL GEOMETRY (For preview and full export)
    // =========================================================================
    const componentCableHoles = allCableHoles.filter((h) => {
      const holeMinX = h.x - h.length / 2;
      const holeMaxX = h.x + h.length / 2;
      return holeMaxX >= comp.bbox.minX && holeMinX <= comp.bbox.maxX;
    });

    const componentMounts = computeMounts(comp.mergedContours, {
      mountShankDiameter: req.params.mountShankDiameter,
      mountSlotY: req.params.mountSlotY,
      mountSlotXInset: req.params.mountSlotXInset,
      wallThickness: req.params.wallThickness,
      backThickness: req.params.backThickness,
      backCavityDepth: req.params.backCavityDepth,
      outerEdges: { left: true, right: true },
    });

    const bulbResult = await computeBulbHoles(comp.mergedContours, {
      bulbHoleDiameter: req.params.bulbHoleDiameter,
      bulbHoleSpacing: req.params.bulbHoleSpacing,
      bulbHoleInset: req.params.bulbHoleInset,
      bulbHoleMaxCount: req.params.bulbHoleMaxCount,
      wallThickness: req.params.wallThickness,
    });
    if (bulbResult.warning === "bulbhole_inset_collapsed") {
      warnings.push({ kind: "bulbhole_inset_collapsed", members: memberRefs });
    }

    const meshResult = await buildLetterShell({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
      backCavityDepth: req.params.backCavityDepth,
      cableHoles: componentCableHoles,
      bulbHoles: bulbResult.holes,
      mounts: componentMounts.slots.length > 0 ? componentMounts : undefined,
    });

    if (meshResult.ok) {
      const centered = centerMeshXY(meshResult.mesh);
      const plexiRaw = await buildLetterPlexi({
        contours: comp.mergedContours,
        totalDepth: req.params.totalDepth,
        rabbetDepth: req.params.rabbetDepth,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
        backCavityDepth: req.params.backCavityDepth,
      });
      let plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
      if (plexiRaw) {
        const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
        const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
        const v = plexiRaw.vertProperties;
        const out = new Float32Array(v.length);
        for (let j = 0; j < v.length; j += 3) {
          out[j] = v[j] - cx;
          out[j + 1] = v[j + 1] - cy;
          out[j + 2] = v[j + 2];
        }
        plexi = { vertProperties: out, triVerts: plexiRaw.triVerts };
      }

      components.push({
        members: memberRefs,
        vertProperties: centered.vertProperties,
        triVerts: centered.triVerts,
        bbox: centered.bbox,
        xOffset: 0,
        plexi,
      });

      const layerResult = await buildLetterLayers({
        contours: comp.mergedContours,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
      });
      if (layerResult) {
        layers.push({ members: memberRefs, ...layerResult });
      }
    } else {
      errors.push({ members: memberRefs, reason: meshResult.reason });
    }

    // =========================================================================
    // PASS 2: BUILD SLICED PIECES (For sliced export)
    // =========================================================================
    const sliceResult = await sliceComponent(
      comp,
      req.params.cuts,
      req.params.maxPieceWidth,
      {
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
      },
    );
    warnings.push(...sliceResult.warnings);

    if (sliceResult.pieces.length <= 1 && req.params.cuts.length === 0) {
      continue;
    }
    if (sliceResult.pieces.length === 1 && sliceResult.pieces[0].mergedContours === comp.mergedContours) {
      continue;
    }

    for (let i = 0; i < sliceResult.pieces.length; i++) {
      const piece = sliceResult.pieces[i];
      const outerEdge = sliceResult.outerEdges[i];
      const pieceIndex = i + 1;
      const totalSlices = sliceResult.pieces.length;

      const pieceCableHoles = allCableHoles.filter((h) => {
        const holeMinX = h.x - h.length / 2;
        const holeMaxX = h.x + h.length / 2;
        if (holeMaxX < piece.bbox.minX || holeMinX > piece.bbox.maxX) return false;
        if (h.kind === "power-entry-left" && !outerEdge.left) return false;
        if (h.kind === "power-entry-right" && !outerEdge.right) return false;
        return true;
      });

      const pieceMounts = computeMounts(piece.mergedContours, {
        mountShankDiameter: req.params.mountShankDiameter,
        mountSlotY: req.params.mountSlotY,
        mountSlotXInset: req.params.mountSlotXInset,
        wallThickness: req.params.wallThickness,
        backThickness: req.params.backThickness,
        backCavityDepth: req.params.backCavityDepth,
        outerEdges: outerEdge,
      });

      const pieceBulbResult = await computeBulbHoles(piece.mergedContours, {
        bulbHoleDiameter: req.params.bulbHoleDiameter,
        bulbHoleSpacing: req.params.bulbHoleSpacing,
        bulbHoleInset: req.params.bulbHoleInset,
        bulbHoleMaxCount: req.params.bulbHoleMaxCount,
        wallThickness: req.params.wallThickness,
      });
      if (pieceBulbResult.warning === "bulbhole_inset_collapsed") {
        warnings.push({ kind: "bulbhole_inset_collapsed", members: memberRefs });
      }

      const pieceMeshResult = await buildLetterShell({
        contours: piece.mergedContours,
        totalDepth: req.params.totalDepth,
        backThickness: req.params.backThickness,
        wallThickness: req.params.wallThickness,
        rabbetDepth: req.params.rabbetDepth,
        insetWidth: req.params.insetWidth,
        backCavityDepth: req.params.backCavityDepth,
        cableHoles: pieceCableHoles,
        bulbHoles: pieceBulbResult.holes,
        mounts: pieceMounts.slots.length > 0 ? pieceMounts : undefined,
        // Pre-sliced offsets — keeps the channel open at butt-joint cuts.
        cavityContours: piece.cavityContours,
        rabbetContours: piece.rabbetContours,
      });

      if (!pieceMeshResult.ok) {
        errors.push({ members: memberRefs, reason: pieceMeshResult.reason });
        continue;
      }

      const centered = centerMeshXY(pieceMeshResult.mesh);

      const plexiRaw = await buildLetterPlexi({
        contours: piece.mergedContours,
        totalDepth: req.params.totalDepth,
        rabbetDepth: req.params.rabbetDepth,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
        backCavityDepth: req.params.backCavityDepth,
        plexiContours: piece.plexiContours,
      });
      let piecePlexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
      if (plexiRaw) {
        const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
        const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
        const v = plexiRaw.vertProperties;
        const out = new Float32Array(v.length);
        for (let j = 0; j < v.length; j += 3) {
          out[j] = v[j] - cx;
          out[j + 1] = v[j + 1] - cy;
          out[j + 2] = v[j + 2];
        }
        piecePlexi = { vertProperties: out, triVerts: plexiRaw.triVerts };
      }

      slicedComponents.push({
        members: memberRefs,
        vertProperties: centered.vertProperties,
        triVerts: centered.triVerts,
        bbox: centered.bbox,
        xOffset: 0,
        plexi: piecePlexi,
        sliceIndex: pieceIndex,
        totalSlices,
        parentSlot,
      });

      const pieceLayerResult = await buildLetterLayers({
        contours: piece.mergedContours,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
        cavityContours: piece.cavityContours,
        plexiContours: piece.plexiContours,
      });
      if (pieceLayerResult) {
        slicedLayers.push({ members: memberRefs, ...pieceLayerResult });
      }
    }
  }

  const response: WorkerResponse = {
    requestId: req.requestId,
    components,
    slicedComponents,
    layers,
    slicedLayers,
    errors,
    warnings,
  };

  const transferables: Transferable[] = [];
  for (const c of components) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  for (const c of slicedComponents) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  ctx.postMessage(response, transferables);
};