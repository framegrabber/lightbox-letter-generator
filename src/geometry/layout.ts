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
  letterOverlap = 0,
): LayoutEntry[] {
  const scale = capHeightScale(font, letterHeight);
  const glyphs = Array.from(text).map((ch) => ({ ch, glyph: font.charToGlyph(ch) }));

  const entries: LayoutEntry[] = [];
  let cursorFu = 0;

  // letterOverlap is in mm; convert to font units for the cursor arithmetic.
  const overlapFu = scale > 0 ? letterOverlap / scale : 0;

  for (let i = 0; i < glyphs.length; i++) {
    const { ch, glyph } = glyphs[i];
    const isSpace = /\s/.test(ch);

    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale });
    }

    cursorFu += glyph.advanceWidth ?? 0;

    if (i + 1 < glyphs.length) {
      const next = glyphs[i + 1];
      const kern = font.getKerningValue(glyph, next.glyph) ?? 0;
      cursorFu += kern;
      // Apply letter overlap only for non-space pairs (we don't tighten
      // around spaces).
      if (!isSpace && !/\s/.test(next.ch)) {
        cursorFu -= overlapFu;
      }
    }
  }

  return entries;
}
