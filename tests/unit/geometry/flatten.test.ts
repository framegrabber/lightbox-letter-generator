import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { flattenGlyph } from "../../../src/geometry/flatten";

const FONT_PATH = resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf");

function loadFont(): opentype.Font {
  const buf = readFileSync(FONT_PATH);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("flattenGlyph", () => {
  const font = loadFont();

  it("produces at least one closed polygon for 'M'", () => {
    const glyph = font.charToGlyph("M");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBeGreaterThan(0);
    expect(contours[0].length).toBeGreaterThan(2);
  });

  it("produces an outer + hole for 'O'", () => {
    const glyph = font.charToGlyph("O");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBe(2);
  });

  it("produces two disjoint contours for 'i' (dot + stem)", () => {
    const glyph = font.charToGlyph("i");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty list for the space glyph", () => {
    const glyph = font.charToGlyph(" ");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBe(0);
  });

  it("uses CCW winding for outer contours and CW for holes", () => {
    const glyph = font.charToGlyph("O");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    const signed = (poly: [number, number][]) => {
      let s = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        s += (x2 - x1) * (y2 + y1);
      }
      return s; // > 0 means CW in y-up, < 0 means CCW in y-up
    };
    const areas = contours.map(signed);
    // Exactly one outer (CCW) and one hole (CW)
    expect(areas.filter((a) => a < 0).length).toBe(1);
    expect(areas.filter((a) => a > 0).length).toBe(1);
  });
});
