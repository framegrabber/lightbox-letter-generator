import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { buildLetterShell } from "../../../src/geometry/shell";
import type { ShellInputs } from "../../../src/geometry/shell";
import { flattenGlyph } from "../../../src/geometry/flatten";
import { capHeightScale } from "../../../src/geometry/scale";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("buildLetterShell", () => {
  const font = loadFont();
  const baseInputs: Omit<ShellInputs, "contours"> = {
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 3,
    rabbetDepth: 3,
    rabbetLipWidth: 4,
  };

  function contoursFor(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  it("builds a closed manifold mesh for 'M'", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("M") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mesh.vertProperties.length).toBeGreaterThan(0);
      expect(result.mesh.triVerts.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("builds a closed mesh for 'O' (with hole)", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("O") });
    expect(result.ok).toBe(true);
  }, 30_000);

  it("fails with reason='offset_collapsed' when wall is too thick for the glyph", async () => {
    const result = await buildLetterShell({
      ...baseInputs,
      wallThickness: 50,
      rabbetLipWidth: 60,
      contours: contoursFor("i"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("offset_collapsed");
  }, 30_000);
});
