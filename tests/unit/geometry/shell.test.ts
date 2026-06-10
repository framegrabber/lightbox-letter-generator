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

  it("produces a rabbet step (vertices at top - rabbetDepth) for 'M'", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("M") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const top = baseInputs.totalDepth + baseInputs.backCavityDepth; // 25 + 0 = 25
    const expectedShelfZ = top - baseInputs.rabbetDepth; // 25 - 3 = 22
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
    // Verify the rear cavity was actually carved: the internal panel top sits
    // at Z = backCavityDepth (= 20). Vertices at that Z only exist when the
    // rear cavity subtraction ran — without it, the inside of the perimeter
    // wall is solid material from Z=0 to the front cavity floor at Z=22.
    let foundPanelTop = false;
    for (let i = 2; i < result.mesh.vertProperties.length; i += 3) {
      if (Math.abs(result.mesh.vertProperties[i] - 20) < 0.01) {
        foundPanelTop = true;
        break;
      }
    }
    expect(foundPanelTop).toBe(true);
  }, 30_000);
});

describe("buildLetterShell with cableHoles", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursForLetter(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  const baseInputs = {
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 5,
    rabbetDepth: 3,
    insetWidth: 3,
    backCavityDepth: 20,
  };

  it("cableHoles=[] produces the same triangle count as omitting the option", async () => {
    const contours = contoursForLetter("M");
    const a = await buildLetterShell({ ...baseInputs, contours });
    const b = await buildLetterShell({ ...baseInputs, contours, cableHoles: [] });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.triVerts.length).toBe(b.mesh.triVerts.length);
  }, 30_000);

  it("a cableHole intersecting the shell adds geometry (more triangles)", async () => {
    const contours = contoursForLetter("M");
    const noHole = await buildLetterShell({ ...baseInputs, contours });
    expect(noHole.ok).toBe(true);
    if (!noHole.ok) return;
    // Find the shell's X bbox so we can place a hole well inside it.
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < noHole.mesh.vertProperties.length; i += 3) {
      const x = noHole.mesh.vertProperties[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const midX = (minX + maxX) / 2;

    const withHole = await buildLetterShell({
      ...baseInputs,
      contours,
      cableHoles: [{ x: midX, y: 50, z: 10, diameter: 8, length: 200 }],
    });
    expect(withHole.ok).toBe(true);
    if (!withHole.ok) return;
    expect(withHole.mesh.triVerts.length).toBeGreaterThan(noHole.mesh.triVerts.length);
  }, 30_000);

  it("a cableHole far outside the shell's X bbox is a no-op", async () => {
    const contours = contoursForLetter("M");
    const noHole = await buildLetterShell({ ...baseInputs, contours });
    expect(noHole.ok).toBe(true);
    if (!noHole.ok) return;

    const farAway = await buildLetterShell({
      ...baseInputs,
      contours,
      // Hole centered far from any 'M' geometry; cylinder length is small enough
      // to not reach the shell.
      cableHoles: [{ x: 10000, y: 50, z: 10, diameter: 8, length: 20 }],
    });
    expect(farAway.ok).toBe(true);
    if (!farAway.ok) return;
    expect(farAway.mesh.triVerts.length).toBe(noHole.mesh.triVerts.length);
  }, 30_000);

  it("a cableHole with diameter <= 0 is skipped", async () => {
    const contours = contoursForLetter("M");
    const noHole = await buildLetterShell({ ...baseInputs, contours });
    expect(noHole.ok).toBe(true);
    if (!noHole.ok) return;

    const zeroDia = await buildLetterShell({
      ...baseInputs,
      contours,
      cableHoles: [{ x: 0, y: 50, z: 10, diameter: 0, length: 50 }],
    });
    expect(zeroDia.ok).toBe(true);
    if (!zeroDia.ok) return;
    expect(zeroDia.mesh.triVerts.length).toBe(noHole.mesh.triVerts.length);
  }, 30_000);
});
