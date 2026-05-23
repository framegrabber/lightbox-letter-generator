/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { Parameters } from "../state/parameters";

type WorkerRequest = {
  kind: "build";
  requestId: string;
  params: Parameters;
  fontBuffer: ArrayBuffer;
};

type LetterMesh = {
  char: string;
  index: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type LetterLayersMsg = {
  char: string;
  index: number;
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

type LetterError = {
  char: string;
  index: number;
  reason: "offset_collapsed" | "no_contours";
};

type WorkerResponse = {
  requestId: string;
  letters: LetterMesh[];
  layers: LetterLayersMsg[];
  errors: LetterError[];
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind !== "build") return;

  const font = opentype.parse(req.fontBuffer);
  const scale = capHeightScale(font, req.params.letterHeight);
  const chars = Array.from(req.params.text).filter((c) => !/\s/.test(c));

  const letters: LetterMesh[] = [];
  const layers: LetterLayersMsg[] = [];
  const errors: LetterError[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
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
      rabbetLipWidth: req.params.rabbetLipWidth,
    });

    if (!meshResult.ok) {
      errors.push({ char, index: i, reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);
    letters.push({
      char,
      index: i,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
    });

    const layerResult = await buildLetterLayers({
      contours,
      wallThickness: req.params.wallThickness,
      rabbetLipWidth: req.params.rabbetLipWidth,
    });
    if (layerResult) {
      layers.push({ char, index: i, ...layerResult });
    }
  }

  const response: WorkerResponse = { requestId: req.requestId, letters, layers, errors };

  const transferables: Transferable[] = [];
  for (const l of letters) {
    transferables.push(l.vertProperties.buffer, l.triVerts.buffer);
  }
  ctx.postMessage(response, transferables);
};
