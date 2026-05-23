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
  rabbetLipWidth: number;
  bezierTolerance: number;
};

export const DEFAULT_PARAMETERS: Parameters = {
  text: "",
  fontSource: { kind: "bundled", id: "inter" },
  letterHeight: 100,
  wallThickness: 3,
  totalDepth: 25,
  backThickness: 2,
  rabbetDepth: 3,
  rabbetLipWidth: 1.5,
  bezierTolerance: 0.1,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
