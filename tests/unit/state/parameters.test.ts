import { describe, it, expect, beforeEach } from "vitest";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("parameters store", () => {
  beforeEach(() => {
    useParameters.setState(DEFAULT_PARAMETERS);
  });

  it("starts with defaults", () => {
    const state = useParameters.getState();
    expect(state.text).toBe("BURGER");
    expect(state.fontSource).toEqual({ kind: "bundled", id: "anton" });
    expect(state.letterHeight).toBe(200);
    expect(state.wallThickness).toBe(10);
    expect(state.totalDepth).toBe(100);
    expect(state.backThickness).toBe(2);
    expect(state.rabbetDepth).toBe(5);
    expect(state.insetWidth).toBe(5);
    expect(state.bezierTolerance).toBe(0.1);
    expect(state.letterOverlap).toBe(0);
    expect(state.bridgeWidth).toBe(0);
    expect(state.bridgeHeight).toBe(0);
    expect(state.bridgeY).toBe(100); // letterHeight / 2 (mid-letter; letters span Y=[0, letterHeight])
  });

  it("updates a single field via set", () => {
    useParameters.getState().set({ text: "MAKING" });
    expect(useParameters.getState().text).toBe("MAKING");
  });

  it("updates connected-letters fields via set", () => {
    useParameters.getState().set({ letterOverlap: 5, bridgeWidth: 10 });
    expect(useParameters.getState().letterOverlap).toBe(5);
    expect(useParameters.getState().bridgeWidth).toBe(10);
  });
});
