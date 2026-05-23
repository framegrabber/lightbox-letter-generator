import { describe, it, expect, beforeEach } from "vitest";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("parameters store", () => {
  beforeEach(() => {
    useParameters.setState(DEFAULT_PARAMETERS);
  });

  it("starts with defaults", () => {
    const state = useParameters.getState();
    expect(state.text).toBe("");
    expect(state.letterHeight).toBe(100);
    expect(state.wallThickness).toBe(3);
    expect(state.totalDepth).toBe(25);
    expect(state.backThickness).toBe(2);
    expect(state.rabbetDepth).toBe(3);
    expect(state.rabbetLipWidth).toBe(1.5);
    expect(state.bezierTolerance).toBe(0.1);
  });

  it("updates a single field via set", () => {
    useParameters.getState().set({ text: "MAKING" });
    expect(useParameters.getState().text).toBe("MAKING");
  });
});
