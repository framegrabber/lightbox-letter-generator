import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { buildLetterLayers, polygonsToSVG } from "../../../src/exporters/svg";
import { flattenGlyph } from "../../../src/geometry/flatten";
import { capHeightScale } from "../../../src/geometry/scale";

describe("polygonsToSVG", () => {
  it("emits a single closed path for one polygon", () => {
    const svg = polygonsToSVG([[[0, 0], [10, 0], [10, 10], [0, 10]]], { margin: 1 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("M 0 0");
    expect(svg).toContain("Z");
  });

  it("uses mm as units and tight viewBox + margin", () => {
    const svg = polygonsToSVG([[[5, 5], [15, 5], [15, 15], [5, 15]]], { margin: 2 });
    expect(svg).toMatch(/viewBox="3 3 14 14"/);
    expect(svg).toContain('width="14mm"');
    expect(svg).toContain('height="14mm"');
  });

  it("emits each polygon as its own subpath (donut = outer + hole)", () => {
    const svg = polygonsToSVG(
      [
        [[0, 0], [10, 0], [10, 10], [0, 10]],
        [[3, 3], [7, 3], [7, 7], [3, 7]],
      ],
      { margin: 0 },
    );
    const moveCount = (svg.match(/M /g) ?? []).length;
    expect(moveCount).toBe(2);
  });
});

describe("buildLetterLayers", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursFor(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  it("produces all four layers for 'O'", async () => {
    const layers = await buildLetterLayers({
      contours: contoursFor("O"),
      wallThickness: 5,
      insetWidth: 3, // shelf width; lip = wall − inset = 2mm
      plexiTolerance: 0,
    });
    expect(layers).not.toBeNull();
    if (!layers) return;
    expect(layers.back.length).toBeGreaterThan(0);
    expect(layers.wall.length).toBeGreaterThan(0);
    expect(layers.rabbet.length).toBeGreaterThan(0);
    expect(layers.plexi.length).toBeGreaterThan(0);
  }, 30_000);

  it("plexiTolerance>0 produces a smaller plexi polygon than tolerance=0", async () => {
    const base = { contours: contoursFor("O"), wallThickness: 5, insetWidth: 3 };

    const noTol = await buildLetterLayers({ ...base, plexiTolerance: 0 });
    const withTol = await buildLetterLayers({ ...base, plexiTolerance: 0.4 });

    expect(noTol).not.toBeNull();
    expect(withTol).not.toBeNull();
    if (!noTol || !withTol) return;

    function bboxX(polys: [number, number][][]) {
      let minX = Infinity, maxX = -Infinity;
      for (const p of polys) for (const [x] of p) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      return { minX, maxX, w: maxX - minX };
    }

    const a = bboxX(noTol.plexi);
    const b = bboxX(withTol.plexi);
    expect(a.w - b.w).toBeGreaterThan(0.5);
    expect(a.w - b.w).toBeLessThan(1.1);
  }, 30_000);
});
