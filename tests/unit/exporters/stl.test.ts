import { describe, it, expect } from "vitest";
import { meshToBinarySTL } from "../../../src/exporters/stl";

describe("meshToBinarySTL", () => {
  it("writes a valid header + triangle count", () => {
    const mesh = {
      vertProperties: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
    const buf = meshToBinarySTL(mesh);
    const view = new DataView(buf);
    expect(buf.byteLength).toBe(80 + 4 + 50);
    expect(view.getUint32(80, true)).toBe(1);
  });

  it("encodes triangle vertices as little-endian floats", () => {
    const mesh = {
      vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
    const buf = meshToBinarySTL(mesh);
    const view = new DataView(buf);
    expect(view.getFloat32(96, true)).toBe(0);
    expect(view.getFloat32(96 + 12, true)).toBe(1);
  });
});
