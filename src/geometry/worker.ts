/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
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

  const visibleChars: { ch: string; origIndex: number }[] = [];
  Array.from(req.params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleChars.push({ ch: c, origIndex: i });
  });

  const components: ComponentMesh[] = [];
  const layers: ComponentLayers[] = [];
  const errors: ComponentError[] = [];
  const warnings: MergeWarning[] = [];

  for (const { ch: char, origIndex } of visibleChars) {
    const glyph = font.charToGlyph(char);
    const rawContours = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const contours = rawContours.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );

    const member = { char, index: origIndex };

    const meshResult = await buildLetterShell({
      contours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
    });

    if (!meshResult.ok) {
      errors.push({ members: [member], reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);

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

    components.push({
      members: [member],
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
      xOffset: 0, // no word-space translation yet; layout positions are applied in PreviewLetter
      plexi,
    });

    const layerResult = await buildLetterLayers({
      contours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    if (layerResult) {
      layers.push({ members: [member], ...layerResult });
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
