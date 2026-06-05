import type { Parameters } from "../state/parameters";

export type ComponentMember = { char: string; index: number };

export type ComponentMesh = {
  members: ComponentMember[]; // left-to-right order
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  xOffset: number; // word-space minX before the per-component centering
  plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null;
};

export type ComponentLayers = {
  members: ComponentMember[];
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

export type ComponentError = {
  members: ComponentMember[];
  reason: "offset_collapsed" | "no_contours";
};

export type MergeWarning = {
  kind: "bridge_disconnected";
  pair: [ComponentMember, ComponentMember];
};

export type BuildResult = {
  components: ComponentMesh[];
  layers: ComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};

let worker: Worker | null = null;
let counter = 0;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export type WorkerResponse = {
  requestId: string;
  components: ComponentMesh[];
  layers: ComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};

export function build(params: Parameters, fontBuffer: ArrayBuffer): Promise<BuildResult> {
  const w = ensureWorker();
  const requestId = String(++counter);
  const plainParams: Parameters = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
  };
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data?.requestId !== requestId) return;
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      resolve({
        components: ev.data.components,
        layers: ev.data.layers,
        errors: ev.data.errors,
        warnings: ev.data.warnings,
      });
    };
    const errorHandler = (e: ErrorEvent) => {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      reject(new Error(e.message || "Worker failed"));
    };
    w.addEventListener("message", handler);
    w.addEventListener("error", errorHandler);
    w.postMessage({
      kind: "build",
      requestId,
      params: plainParams,
      fontBuffer: fontBuffer.slice(0),
    });
  });
}
