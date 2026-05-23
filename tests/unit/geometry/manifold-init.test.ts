import { describe, it, expect } from "vitest";
import { getManifold } from "../../../src/geometry/manifold-init";

describe("getManifold", () => {
  it("loads the WASM module exactly once", async () => {
    const a = await getManifold();
    const b = await getManifold();
    expect(a).toBe(b);
    expect(typeof a.Manifold).toBe("function");
    expect(typeof a.CrossSection).toBe("function");
  }, 30_000);
});
