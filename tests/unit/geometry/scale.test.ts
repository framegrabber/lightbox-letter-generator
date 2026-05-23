import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { capHeightScale } from "../../../src/geometry/scale";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("capHeightScale", () => {
  it("returns a positive scale that maps cap-height to letterHeight (mm)", () => {
    const font = loadFont();
    const scale = capHeightScale(font, 100);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeGreaterThan(0.04);
    expect(scale).toBeLessThan(0.15);
  });

  it("falls back to 'H' bbox when sCapHeight is missing", () => {
    const font = loadFont();
    const fakeFont = Object.assign(Object.create(Object.getPrototypeOf(font)), font, {
      tables: { ...font.tables, os2: { ...(font.tables as any).os2, sCapHeight: 0 } },
    });
    const scale = capHeightScale(fakeFont as opentype.Font, 100);
    expect(scale).toBeGreaterThan(0);
  });
});
