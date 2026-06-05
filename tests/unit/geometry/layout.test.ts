import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { layoutWord } from "../../../src/geometry/layout";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("layoutWord", () => {
  const font = loadFont();

  it("returns one entry per non-space character", () => {
    const result = layoutWord(font, "Hi", 100);
    expect(result.length).toBe(2);
    expect(result[0].char).toBe("H");
    expect(result[1].char).toBe("i");
  });

  it("advances X by glyph advance width (in mm)", () => {
    const result = layoutWord(font, "AB", 100);
    expect(result[1].xOffset).toBeGreaterThan(result[0].xOffset);
  });

  it("skips space characters but advances", () => {
    const result = layoutWord(font, "A B", 100);
    expect(result.length).toBe(2);
    expect(result[1].char).toBe("B");
    expect(result[1].xOffset).toBeGreaterThan(result[0].xOffset);
  });
});

describe("layoutWord with letterOverlap", () => {
  const font = loadFont();

  it("reduces cursor advance for non-space pairs", () => {
    const noOverlap = layoutWord(font, "AB", 100, 0);
    const withOverlap = layoutWord(font, "AB", 100, 5);
    expect(withOverlap[1].xOffset).toBeCloseTo(noOverlap[1].xOffset - 5, 5);
  });

  it("does not apply overlap across spaces", () => {
    const result = layoutWord(font, "A B", 100, 5);
    const noOverlap = layoutWord(font, "A B", 100, 0);
    // Both glyphs are A and B; the space between them must not be tightened.
    // The B in "A B" should land at the same xOffset as in the zero-overlap case.
    expect(result[1].xOffset).toBeCloseTo(noOverlap[1].xOffset, 5);
  });

  it("defaults to zero overlap when arg is omitted", () => {
    const a = layoutWord(font, "AB", 100);
    const b = layoutWord(font, "AB", 100, 0);
    expect(a[1].xOffset).toBe(b[1].xOffset);
  });
});

describe("layoutWord originalIndex", () => {
  const font = loadFont();

  it("carries the original text index for non-space glyphs", () => {
    const result = layoutWord(font, "A B", 100, 0);
    expect(result.length).toBe(2);
    expect(result[0].originalIndex).toBe(0);
    expect(result[1].originalIndex).toBe(2); // space at index 1 is skipped
  });
});
