/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { Parameters } from "../state/parameters";
import type {
  LetterMesh,
  LetterLayers,
  LetterError,
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
  // Keep the original text index (including spaces) so the preview can
  // match letters to their layout slots even when the text contains spaces.
  const visibleChars: { ch: string; origIndex: number }[] = [];
  Array.from(req.params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleChars.push({ ch: c, origIndex: i });
  });

  const letters: LetterMesh[] = [];
  const layers: LetterLayers[] = [];
  const errors: LetterError[] = [];

  for (const { ch: char, origIndex } of visibleChars) {
    const glyph = font.charToGlyph(char);
    const rawContours = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const contours = rawContours.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );

    const meshResult = await buildLetterShell({
      contours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
    });

    if (!meshResult.ok) {
      errors.push({ char, index: origIndex, reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);

    // Build the plexi mesh for this letter and shift it by the same
    // (cx, cy) the shell got from centerMeshXY so it stays aligned.
    const plexiRaw = await buildLetterPlexi({
      contours,
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

    letters.push({
      char,
      index: origIndex,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
      plexi,
    });

    const layerResult = await buildLetterLayers({
      contours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    if (layerResult) {
      layers.push({ char, index: origIndex, ...layerResult });
    }
  }

  const response: WorkerResponse = { requestId: req.requestId, letters, layers, errors };

  const transferables: Transferable[] = [];
  for (const l of letters) {
    transferables.push(l.vertProperties.buffer, l.triVerts.buffer);
    if (l.plexi) {
      transferables.push(l.plexi.vertProperties.buffer, l.plexi.triVerts.buffer);
    }
  }
  ctx.postMessage(response, transferables);
};
