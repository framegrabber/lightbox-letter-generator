import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFontBuffer, sha256OfBuffer } from "../../../src/fonts/load";

const FONT_PATH = resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf");

describe("parseFontBuffer", () => {
  it("parses a valid TTF", async () => {
    const buf = readFileSync(FONT_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font = await parseFontBuffer(ab);
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.charToGlyph("M").index).toBeGreaterThan(0);
  });

  it("rejects non-font input", async () => {
    const ab = new TextEncoder().encode("not a font").buffer;
    await expect(parseFontBuffer(ab)).rejects.toThrow();
  });
});

describe("sha256OfBuffer", () => {
  it("produces 64 hex chars", async () => {
    const buf = readFileSync(FONT_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const hash = await sha256OfBuffer(ab);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
