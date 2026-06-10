import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { buildLetterShell, buildLetterPlexi } from "../../../src/geometry/shell";
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
    wallThickness: 5,
    rabbetDepth: 3,
    insetWidth: 3, // shelf width; lip = wall − inset = 2mm (matches the old rabbetLipWidth: 2)
    backCavityDepth: 0,
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
      insetWidth: 10,
      contours: contoursFor("i"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("offset_collapsed");
  }, 30_000);

  it("produces a rabbet step (vertices at totalDepth - rabbetDepth) for 'M'", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("M") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedShelfZ = baseInputs.totalDepth - baseInputs.rabbetDepth; // 25 - 3 = 22
    let found = false;
    const v = result.mesh.vertProperties;
    for (let i = 2; i < v.length; i += 3) {
      if (Math.abs(v[i] - expectedShelfZ) < 0.01) { found = true; break; }
    }
    expect(found).toBe(true);
  }, 30_000);
});

describe("buildLetterPlexi tolerance", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursForLetter(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  function meshBboxXY(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.vertProperties.length; i += 3) {
      const x = mesh.vertProperties[i];
      const y = mesh.vertProperties[i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  it("plexiTolerance>0 produces a smaller mesh than tolerance=0", async () => {
    const contours = contoursForLetter("M");
    const base = { contours, totalDepth: 25, rabbetDepth: 3, wallThickness: 5, insetWidth: 3, backCavityDepth: 0 };

    const noTol = await buildLetterPlexi({ ...base, plexiTolerance: 0 });
    const withTol = await buildLetterPlexi({ ...base, plexiTolerance: 0.4 });

    expect(noTol).not.toBeNull();
    expect(withTol).not.toBeNull();
    if (!noTol || !withTol) return;

    const a = meshBboxXY(noTol);
    const b = meshBboxXY(withTol);
    // With 0.4 mm shrink on each side, X width should be ≈ 0.8 mm smaller.
    const widthDelta = (a.maxX - a.minX) - (b.maxX - b.minX);
    expect(widthDelta).toBeGreaterThan(0.5);
    expect(widthDelta).toBeLessThan(1.1);
  }, 30_000);
});

describe("buildLetterShell with backCavityDepth", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursForLetter(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  function meshZBbox(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }) {
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < mesh.vertProperties.length; i += 3) {
      const z = mesh.vertProperties[i];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return { minZ, maxZ };
  }

  const baseInputs = {
    contours: [] as ReturnType<typeof contoursForLetter>,
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 5,
    rabbetDepth: 3,
    insetWidth: 3,
  };

  it("backCavityDepth=0 produces Z range [0, totalDepth] (today's behavior)", async () => {
    const result = await buildLetterShell({
      ...baseInputs,
      contours: contoursForLetter("M"),
      backCavityDepth: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { minZ, maxZ } = meshZBbox(result.mesh);
    expect(minZ).toBeCloseTo(0, 4);
    expect(maxZ).toBeCloseTo(25, 4);
  }, 30_000);

  it("backCavityDepth=20 grows the Z range by exactly 20mm", async () => {
    const result = await buildLetterShell({
      ...baseInputs,
      contours: contoursForLetter("M"),
      backCavityDepth: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { minZ, maxZ } = meshZBbox(result.mesh);
    expect(minZ).toBeCloseTo(0, 4);
    expect(maxZ).toBeCloseTo(45, 4); // totalDepth(25) + backCavityDepth(20)
  }, 30_000);
});
