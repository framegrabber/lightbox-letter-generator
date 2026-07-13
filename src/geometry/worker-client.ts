import type { Parameters } from "../state/parameters";

export type { BulbHole } from "./bulb-holes";

export type ComponentMember = { char: string; index: number };

export type ComponentMesh = {
  members: ComponentMember[]; // left-to-right order
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  xOffset: number; // word-space minX before the per-component centering
  plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null;
};

export type SlicedComponentMesh = ComponentMesh & {
  sliceIndex: number;
  totalSlices: number;
  parentSlot: number;   // 1-based, matches the parent's index in `components` (+ 1)
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

export type MergeWarning =
  | { kind: "bridge_disconnected"; pair: [ComponentMember, ComponentMember] }
  | { kind: "bulbhole_inset_collapsed"; members: ComponentMember[] };

export type SliceWarning =
  | { kind: "slice_empty"; componentMembers: ComponentMember[]; sliceIndex: number }
  | { kind: "slice_crossed"; cuts: [number, number] }
  | { kind: "slice_oversize"; componentMembers: ComponentMember[]; sliceIndex: number; width: number }
  | { kind: "slice_recommended"; componentMembers: ComponentMember[] };

export type BuildResult = {
  components: ComponentMesh[];
  slicedComponents: SlicedComponentMesh[];
  layers: ComponentLayers[];
  slicedLayers: ComponentLayers[];
  errors: ComponentError[];
  warnings: (MergeWarning | SliceWarning)[];
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
  slicedComponents: SlicedComponentMesh[];
  layers: ComponentLayers[];
  slicedLayers: ComponentLayers[];
  errors: ComponentError[];
  warnings: (MergeWarning | SliceWarning)[];
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
    plexiTolerance: params.plexiTolerance,
    backCavityDepth: params.backCavityDepth,
    cableHoleDiameter: params.cableHoleDiameter,
    cableHoleY: params.cableHoleY,
    cableHoleZ: params.cableHoleZ,
    cableHoleAtEnds: params.cableHoleAtEnds,
    mountShankDiameter: params.mountShankDiameter,
    mountSlotY: params.mountSlotY,
    mountSlotXInset: params.mountSlotXInset,
    bulbHoleDiameter: params.bulbHoleDiameter,
    bulbHoleSpacing: params.bulbHoleSpacing,
    bulbHoleInset: params.bulbHoleInset,
    bulbHoleMaxCount: params.bulbHoleMaxCount,
    maxPieceWidth: params.maxPieceWidth,
    cuts: params.cuts,
  };
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data?.requestId !== requestId) return;
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      resolve({
        components: ev.data.components,
        slicedComponents: ev.data.slicedComponents,
        layers: ev.data.layers,
        slicedLayers: ev.data.slicedLayers,
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
