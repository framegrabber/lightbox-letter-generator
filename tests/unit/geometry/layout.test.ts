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
