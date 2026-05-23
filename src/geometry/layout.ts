import opentype from "opentype.js";
import { capHeightScale } from "./scale";

export type LayoutEntry = {
  char: string;
  glyph: opentype.Glyph;
  xOffset: number; // mm, position of glyph origin in word space
};

export function layoutWord(
  font: opentype.Font,
  text: string,
  letterHeight: number,
): LayoutEntry[] {
  const scale = capHeightScale(font, letterHeight);
  const glyphs = Array.from(text).map((ch) => ({ ch, glyph: font.charToGlyph(ch) }));

  const entries: LayoutEntry[] = [];
  let cursorFu = 0;

  for (let i = 0; i < glyphs.length; i++) {
    const { ch, glyph } = glyphs[i];
    const isSpace = /\s/.test(ch);

    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale });
    }

    cursorFu += glyph.advanceWidth ?? 0;

    if (i + 1 < glyphs.length) {
      const next = glyphs[i + 1].glyph;
      const kern = font.getKerningValue(glyph, next) ?? 0;
      cursorFu += kern;
    }
  }

  return entries;
}
