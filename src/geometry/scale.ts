import type opentype from "opentype.js";

/**
 * Returns the scale factor that maps font units to mm such that the font's
 * cap-height equals letterHeight mm. Falls back to measuring the 'H' glyph
 * bounding box when OS/2 sCapHeight is unavailable or zero.
 */
export function capHeightScale(font: opentype.Font, letterHeight: number): number {
  const os2 = (font.tables as any).os2;
  let capHeightFu: number = os2?.sCapHeight ?? 0;

  if (!capHeightFu || capHeightFu <= 0) {
    const h = font.charToGlyph("H");
    if (h && h.getBoundingBox) {
      const bb = h.getBoundingBox();
      capHeightFu = Math.abs(bb.y2 - bb.y1);
    }
  }

  if (!capHeightFu || capHeightFu <= 0) {
    capHeightFu = font.unitsPerEm * 0.7;
  }

  return letterHeight / capHeightFu;
}
