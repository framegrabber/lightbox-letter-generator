import type { Parameters } from "../state/parameters";

export type LetterMesh = {
  char: string;
  index: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export type LetterLayers = {
  char: string;
  index: number;
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

export type LetterError = {
  char: string;
  index: number;
  reason: "offset_collapsed" | "no_contours";
};

export type BuildResult = {
  letters: LetterMesh[];
  layers: LetterLayers[];
  errors: LetterError[];
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
  letters: LetterMesh[];
  layers: LetterLayers[];
  errors: LetterError[];
};

export function build(params: Parameters, fontBuffer: ArrayBuffer): Promise<BuildResult> {
  const w = ensureWorker();
  const requestId = String(++counter);
  // Extract only the plain data fields. The zustand store passes its full state
  // (including the `set` function) which is not structured-cloneable.
  const plainParams: Parameters = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    rabbetLipWidth: params.rabbetLipWidth,
    bezierTolerance: params.bezierTolerance,
  };
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data?.requestId !== requestId) return;
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      resolve({ letters: ev.data.letters, layers: ev.data.layers, errors: ev.data.errors });
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
