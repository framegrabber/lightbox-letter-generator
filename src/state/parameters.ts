import { create } from "zustand";

export type FontSource =
  | { kind: "bundled"; id: string }
  | { kind: "uploaded"; name: string; sha256: string };

export type Parameters = {
  text: string;
  fontSource: FontSource;
  letterHeight: number;
  wallThickness: number;
  totalDepth: number;
  backThickness: number;
  rabbetDepth: number;
  insetWidth: number;
  bezierTolerance: number;
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
  plexiTolerance: number;
  backCavityDepth: number;
  cableHoleDiameter: number;
  cableHoleY: number;
  cableHoleZ: number;
  cableHoleAtEnds: boolean;
};

const DEFAULT_LETTER_HEIGHT = 200;
export const DEFAULT_BACK_CAVITY_DEPTH = 20;

export const DEFAULT_PARAMETERS: Parameters = {
  text: "BURGER",
  fontSource: { kind: "bundled", id: "anton" },
  letterHeight: DEFAULT_LETTER_HEIGHT,
  wallThickness: 10,
  totalDepth: 100,
  backThickness: 2,
  rabbetDepth: 5,
  insetWidth: 5,
  bezierTolerance: 0.1,
  letterOverlap: 0,
  bridgeWidth: 0,
  bridgeHeight: 0,
  bridgeY: DEFAULT_LETTER_HEIGHT / 2,
  plexiTolerance: 0.1,
  backCavityDepth: DEFAULT_BACK_CAVITY_DEPTH,
  cableHoleDiameter: 0,
  cableHoleY: DEFAULT_LETTER_HEIGHT / 2,
  cableHoleZ: DEFAULT_BACK_CAVITY_DEPTH / 2,
  cableHoleAtEnds: true,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
