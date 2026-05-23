export type Polygon = [number, number][];

export type GlyphContours = Polygon[];

export type LetterGeometry = {
  char: string;
  index: number;
  contours: GlyphContours;
  advanceX: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};
