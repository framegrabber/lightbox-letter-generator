/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { layoutWord } from "./layout";
import { mergeIntoComponents } from "./merge";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { GlyphContours } from "./types";
import type { Parameters } from "../state/parameters";
import type {
  ComponentMesh,
  ComponentLayers,
  ComponentError,
  MergeWarning,
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

  const components: ComponentMesh[] = [];
  const layers: ComponentLayers[] = [];
  const errors: ComponentError[] = [];
  const warnings: MergeWarning[] = merged.warnings;

  for (const comp of merged.components) {
    const memberRefs = comp.members.map((m) => ({ char: m.char, index: m.index }));

    const meshResult = await buildLetterShell({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
    });

    if (!meshResult.ok) {
      errors.push({ members: memberRefs, reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);

    const plexiRaw = await buildLetterPlexi({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      rabbetDepth: req.params.rabbetDepth,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    let plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
    if (plexiRaw) {
      const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
      const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
      const v = plexiRaw.vertProperties;
      const out = new Float32Array(v.length);
      for (let i = 0; i < v.length; i += 3) {
        out[i] = v[i] - cx;
        out[i + 1] = v[i + 1] - cy;
        out[i + 2] = v[i + 2];
      }
      plexi = { vertProperties: out, triVerts: plexiRaw.triVerts };
    }

    components.push({
      members: memberRefs,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
      // Word-space position is already encoded in the centered bbox; PreviewLetter
      // reconstructs it via cx/cy, so xOffset must be 0 to avoid double-counting.
      xOffset: 0,
      plexi,
    });

    const layerResult = await buildLetterLayers({
      contours: comp.mergedContours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    if (layerResult) {
      layers.push({ members: memberRefs, ...layerResult });
    }
  }

  const response: WorkerResponse = {
    requestId: req.requestId,
    components,
    layers,
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
  ctx.postMessage(response, transferables);
};
