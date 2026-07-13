import { create } from "zustand";

export type FontSource =
  | { kind: "bundled"; id: string }
  | { kind: "uploaded"; name: string; sha256: string };

export type Cut = {
  x: number;       // mm, in word-space X
  angle: number;   // degrees, signed; 0 = vertical cut, +tilts top of the line to the right
};

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
  mountShankDiameter: number;
  mountSlotY: number;
  mountSlotXInset: number;
  bulbHoleDiameter: number;
  bulbHoleSpacing: number;
  bulbHoleInset: number;
  bulbHoleMaxCount: number;
  maxPieceWidth: number;
  cuts: Cut[];
};

const DEFAULT_LETTER_HEIGHT = 200;
const DEFAULT_WALL_THICKNESS = 10;
export const DEFAULT_BACK_CAVITY_DEPTH = 20;

export const DEFAULT_PARAMETERS: Parameters = {
  text: "BURGER",
  fontSource: { kind: "bundled", id: "anton" },
  letterHeight: DEFAULT_LETTER_HEIGHT,
  wallThickness: DEFAULT_WALL_THICKNESS,
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
  mountShankDiameter: 0,
  mountSlotY: DEFAULT_LETTER_HEIGHT * 0.75,
  mountSlotXInset: DEFAULT_WALL_THICKNESS * 2,
  bulbHoleDiameter: 0,
  bulbHoleSpacing: 30,
  bulbHoleInset: DEFAULT_WALL_THICKNESS,
  bulbHoleMaxCount: 12,
  maxPieceWidth: 0,
  cuts: [],
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
