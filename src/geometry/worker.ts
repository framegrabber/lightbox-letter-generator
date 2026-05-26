/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, centerMeshXY } from "./shell";
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
    letters.push({
      char,
      index: origIndex,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
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
  }
  ctx.postMessage(response, transferables);
};
