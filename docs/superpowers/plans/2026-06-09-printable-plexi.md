# Printable Plexi Inserts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a printable plexi STL alongside the existing shell STL and SVG cut sheet, with an XY tolerance applied to all three so a 3D-printed or laser-cut insert drops into the rabbet recess.

**Architecture:** One new parameter, `plexiTolerance` (default 0.2 mm). The XY shrink is applied inside `buildLetterPlexi` and `buildLetterLayers` (offset becomes `-(lipWidth + plexiTolerance)`). The same shrunken mesh is used for both preview and STL export. Zip layout is reorganized to `stl/chars/`, `stl/plexi/`, and `svg/`; filenames carry `_char` / `_plexi` suffixes and the zip filename includes the sanitized text and a local-timezone ISO timestamp.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Vite, React 19, manifold-3d (WASM via Web Worker), zustand, Vitest, Playwright.

**Spec reference:** `docs/superpowers/specs/2026-06-09-printable-plexi-design.md`

---

## File Structure

**Created:**
- `src/exporters/filename.ts` — pure function `buildZipFilename(text, date)` returning `lightbox-<text>-<localIso>.zip` with sanitization rules.
- `tests/unit/exporters/filename.test.ts` — unit tests for filename construction.

**Modified:**
- `src/state/parameters.ts` — `plexiTolerance` field, default `0.2`.
- `src/state/persistence.ts` — `migrate()` fills the field for old saves.
- `src/geometry/validate.ts` — `≥ 0` and `< lipWidth` rules.
- `src/geometry/shell.ts` — `PlexiInputs.plexiTolerance`; offset uses `-(lipWidth + plexiTolerance)`.
- `src/exporters/svg.ts` — `LayerInputs.plexiTolerance`; same offset change.
- `src/geometry/worker.ts` — passes `plexiTolerance` to `buildLetterPlexi` and `buildLetterLayers`.
- `src/geometry/worker-client.ts` — `plainParams` adds `plexiTolerance`.
- `src/ui/ControlsPanel.tsx` — new `NumberField` for plexi tolerance.
- `src/exporters/zip.ts` — three-array `bundleAll` signature; new folder layout; `_char`/`_plexi` suffixes.
- `src/exporters/manifest.ts` — print new param; updated file-tree section.
- `src/ui/ExportButtons.tsx` — three-array bundle call, new zip filename, reproduce URL adds the param.
- `tests/unit/state/parameters.test.ts` — defaults include `plexiTolerance: 0.2`.
- `tests/unit/state/persistence.test.ts` — `migrate()` fills the new field.
- `tests/unit/geometry/validate.test.ts` — bounds for the new field.
- `tests/unit/geometry/shell.test.ts` — `buildLetterPlexi` with tolerance produces a smaller mesh.
- `tests/unit/exporters/svg.test.ts` — `buildLetterLayers` with tolerance produces smaller plexi polygons.
- `tests/unit/exporters/zip.test.ts` — rewritten for the new three-array API and folder layout.
- `tests/unit/exporters/manifest.test.ts` — README contains `Plexi tolerance:` line and new file-tree text.
- `tests/e2e/smoke.spec.ts` — assert new layout, suffixes, filename pattern.

---

## Task 1: Add plexiTolerance parameter

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `tests/unit/state/parameters.test.ts`
- Modify: `tests/unit/state/persistence.test.ts`
- Modify: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write failing parameters-store test**

In `tests/unit/state/parameters.test.ts`, find the "starts with defaults" test and add the following expectation just before the closing `});` of that `it()`:

```ts
    expect(state.plexiTolerance).toBe(0.2);
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: FAIL — `state.plexiTolerance` is `undefined`.

- [ ] **Step 3: Add the parameter with default**

In `src/state/parameters.ts`, modify the `Parameters` type by adding a `plexiTolerance: number;` field after `bridgeY`. Then modify `DEFAULT_PARAMETERS` by adding `plexiTolerance: 0.2,` at the end (just before the closing brace).

The result of those two edits should match this exactly:

```ts
export type Parameters = {
  text: string;
  fontSource: FontSource;
  letterHeight: number;
  wallThickness: number;
  totalDepth: number;
  backThickness: number;
  rabbetDepth: number;
  insetWidth: number;
  bezierTolerance: number;
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
  plexiTolerance: number;
};

const DEFAULT_LETTER_HEIGHT = 200;

export const DEFAULT_PARAMETERS: Parameters = {
  text: "BURGER",
  fontSource: { kind: "bundled", id: "anton" },
  letterHeight: DEFAULT_LETTER_HEIGHT,
  wallThickness: 10,
  totalDepth: 100,
  backThickness: 2,
  rabbetDepth: 5,
  insetWidth: 5,
  bezierTolerance: 0.1,
  letterOverlap: 0,
  bridgeWidth: 0,
  bridgeHeight: 0,
  bridgeY: DEFAULT_LETTER_HEIGHT / 2,
  plexiTolerance: 0.2,
};
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing persistence tests**

In `tests/unit/state/persistence.test.ts`, append the following two `it` blocks inside the existing `describe("persistence migrate", ...)` block (just before the closing `});` of the describe):

```ts
  it("fills plexiTolerance default when missing", () => {
    const out = migrate({
      letterHeight: 200,
      wallThickness: 10,
      insetWidth: 5,
    });
    expect(out.plexiTolerance).toBe(0.2);
  });

  it("preserves an existing plexiTolerance value", () => {
    const out = migrate({
      letterHeight: 200,
      plexiTolerance: 0.35,
    });
    expect(out.plexiTolerance).toBe(0.35);
  });
```

- [ ] **Step 6: Run, verify failure**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: FAIL — `out.plexiTolerance` is `undefined`.

- [ ] **Step 7: Update persistence.ts**

In `src/state/persistence.ts`, find the `migrate` function and the section that fills connected-letters defaults. Just before `return out as Partial<Parameters>;`, add:

```ts
  if (typeof out.plexiTolerance !== "number") {
    out.plexiTolerance = DEFAULT_PARAMETERS.plexiTolerance;
  }
```

In the `Serializable` type and the `ser` object inside `initPersistence`, add `plexiTolerance: state.plexiTolerance,` after `bridgeY: state.bridgeY,` so the field round-trips through localStorage and the URL.

The complete `Serializable` type should be:

```ts
type Serializable = Omit<Parameters, "fontSource"> & {
  fontSource: { kind: "bundled"; id: string } | { kind: "uploaded"; name: string; sha256: string };
};
```

(That's already correct because `Serializable` extends `Omit<Parameters, ...>` — adding `plexiTolerance` to `Parameters` automatically extends `Serializable`. So you only need to update the `ser` object's literal field list.)

The complete `ser` literal inside `initPersistence` should match:

```ts
    const ser: Serializable = {
      text: state.text,
      fontSource: state.fontSource,
      letterHeight: state.letterHeight,
      wallThickness: state.wallThickness,
      totalDepth: state.totalDepth,
      backThickness: state.backThickness,
      rabbetDepth: state.rabbetDepth,
      insetWidth: state.insetWidth,
      bezierTolerance: state.bezierTolerance,
      letterOverlap: state.letterOverlap,
      bridgeWidth: state.bridgeWidth,
      bridgeHeight: state.bridgeHeight,
      bridgeY: state.bridgeY,
      plexiTolerance: state.plexiTolerance,
    };
```

- [ ] **Step 8: Run, verify pass**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 9: Write failing validation tests**

In `tests/unit/geometry/validate.test.ts`, append a new `describe` block just before the file's final `});`:

```ts
describe("plexiTolerance bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 50,
    plexiTolerance: 0.2,
  };

  it("accepts the default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts zero", () => {
    expect(validate({ ...base, plexiTolerance: 0 }).ok).toBe(true);
  });

  it("rejects negative", () => {
    expect(validate({ ...base, plexiTolerance: -0.1 }).ok).toBe(false);
  });

  it("rejects non-finite", () => {
    expect(validate({ ...base, plexiTolerance: NaN }).ok).toBe(false);
  });

  it("rejects when >= (wallThickness − insetWidth)", () => {
    // lipWidth = 10 − 5 = 5 → tolerance must be < 5
    expect(validate({ ...base, plexiTolerance: 5 }).ok).toBe(false);
    expect(validate({ ...base, plexiTolerance: 6 }).ok).toBe(false);
  });

  it("accepts a value just under the upper bound", () => {
    expect(validate({ ...base, plexiTolerance: 4.9 }).ok).toBe(true);
  });
});
```

Note: this `describe` block uses field name `bridgeY: 50` (a positive value, matching the convention that letters span Y ∈ [0, +letterHeight]).

- [ ] **Step 10: Run, verify failure**

Run: `npx vitest run tests/unit/geometry/validate.test.ts`
Expected: FAIL — the new field is not validated yet.

- [ ] **Step 11: Add validation rules**

In `src/geometry/validate.ts`, find the connected-letters bounds block at the bottom of `validate()`. Just before `return errors.length === 0 ? { ok: true } : { ok: false, errors };`, add:

```ts
  if (!Number.isFinite(p.plexiTolerance) || p.plexiTolerance < 0) {
    errors.push({ field: "plexiTolerance", message: "Plexi tolerance must be ≥ 0" });
  } else if (
    Number.isFinite(p.wallThickness) &&
    Number.isFinite(p.insetWidth) &&
    p.plexiTolerance >= p.wallThickness - p.insetWidth
  ) {
    errors.push({
      field: "plexiTolerance",
      message: "Plexi tolerance must be less than (wall thickness − inset width); larger collapses the insert",
    });
  }
```

- [ ] **Step 12: Run all tests, verify pass**

Run: `npx vitest run tests/unit/geometry/validate.test.ts tests/unit/state/`
Expected: all PASS.

- [ ] **Step 13: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add src/state/parameters.ts src/state/persistence.ts src/geometry/validate.ts \
  tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
  tests/unit/geometry/validate.test.ts
git commit -m "feat: add plexiTolerance parameter with defaults

Adds a single new parameter (default 0.2 mm) representing the
XY shrink applied to the plexi insert geometry so a printed or
cut piece drops into the rabbet recess. Validation: ≥ 0 and
strictly less than (wallThickness − insetWidth); the upper bound
prevents the inner offset from collapsing the insert. Not
consumed by any geometry yet — that lands in Task 2."
```

---

## Task 2: Apply plexiTolerance to plexi geometry

**Files:**
- Modify: `src/geometry/shell.ts`
- Modify: `src/exporters/svg.ts`
- Modify: `tests/unit/geometry/shell.test.ts`
- Modify: `tests/unit/exporters/svg.test.ts`

- [ ] **Step 1: Write failing test for `buildLetterPlexi` with tolerance**

In `tests/unit/geometry/shell.test.ts`, append a new `describe` block just before the file's final `});`:

```ts
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
    const base = { contours, totalDepth: 25, rabbetDepth: 3, wallThickness: 5, insetWidth: 3 };

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
```

Add an import for `buildLetterPlexi` at the top of the file alongside the existing imports:

```ts
import { buildLetterShell, buildLetterPlexi } from "../../../src/geometry/shell";
```

(replace the existing `buildLetterShell`-only import line).

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/unit/geometry/shell.test.ts`
Expected: FAIL — `buildLetterPlexi` doesn't accept `plexiTolerance`.

- [ ] **Step 3: Add `plexiTolerance` to `PlexiInputs` and apply in offset**

In `src/geometry/shell.ts`, modify the `PlexiInputs` type and the offset call inside `buildLetterPlexi`. The complete updated type and function should match:

```ts
export type PlexiInputs = {
  contours: GlyphContours;
  totalDepth: number;
  rabbetDepth: number;
  wallThickness: number;
  insetWidth: number;
  plexiTolerance: number;
};

// Standalone mesh of just the plexi piece — same XY shape as the rabbet
// cutout, shrunk inward by `plexiTolerance` so the printed or cut insert
// drops into the recess. Extruded by rabbetDepth, positioned to sit flush.
// Returns null if the inset cutout collapses for this glyph.
export async function buildLetterPlexi(input: PlexiInputs): Promise<{ vertProperties: Float32Array; triVerts: Uint32Array } | null> {
  if (input.contours.length === 0) return null;
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-(lipWidth + input.plexiTolerance), "Round");

  if (rabbetCut.isEmpty()) {
    outer.delete();
    rabbetCut.delete();
    return null;
  }

  const extruded = rabbetCut.extrude(input.rabbetDepth);
  const positioned = extruded.translate([0, 0, input.totalDepth - input.rabbetDepth]);
  const mesh = positioned.getMesh();
  const vertProperties = mesh.vertProperties.slice();
  const triVerts = mesh.triVerts.slice();

  outer.delete();
  rabbetCut.delete();
  extruded.delete();
  positioned.delete();
  return { vertProperties, triVerts };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/geometry/shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing test for `buildLetterLayers` with tolerance**

In `tests/unit/exporters/svg.test.ts`, append a new `it` block inside the existing `describe("buildLetterLayers", ...)` block:

```ts
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
```

- [ ] **Step 6: Run, verify failure**

Run: `npx vitest run tests/unit/exporters/svg.test.ts`
Expected: FAIL — `buildLetterLayers` doesn't accept `plexiTolerance`.

- [ ] **Step 7: Add `plexiTolerance` to `LayerInputs` and apply in offset**

In `src/exporters/svg.ts`, modify the `LayerInputs` type and the offset call inside `buildLetterLayers`. The complete updated type and function should match:

```ts
export type LayerInputs = {
  contours: GlyphContours;
  wallThickness: number;
  insetWidth: number; // shelf width; lip = wallThickness − insetWidth
  plexiTolerance: number;
};

export async function buildLetterLayers(input: LayerInputs): Promise<LetterLayers | null> {
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const cavity = outer.offset(-input.wallThickness, "Round");
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-(lipWidth + input.plexiTolerance), "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return null;
  }

  const wall = outer.subtract(cavity);
  const rabbet = outer.subtract(rabbetCut);

  const result: LetterLayers = {
    back: outer.toPolygons() as Polygon[],
    wall: wall.toPolygons() as Polygon[],
    rabbet: rabbet.toPolygons() as Polygon[],
    plexi: rabbetCut.toPolygons() as Polygon[],
  };

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  wall.delete();
  rabbet.delete();
  return result;
}
```

Also update the existing `buildLetterLayers` test in this same file (the "produces all four layers for 'O'" test) to pass `plexiTolerance: 0` so it keeps compiling:

```ts
  it("produces all four layers for 'O'", async () => {
    const layers = await buildLetterLayers({
      contours: contoursFor("O"),
      wallThickness: 5,
      insetWidth: 3, // shelf width; lip = wall − inset = 2mm
      plexiTolerance: 0,
    });
```

- [ ] **Step 8: Run all tests, verify pass**

Run: `npx vitest run tests/unit/exporters/svg.test.ts tests/unit/geometry/shell.test.ts`
Expected: PASS.

- [ ] **Step 9: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: NOT clean — `worker.ts` still calls `buildLetterPlexi` and `buildLetterLayers` without the new field. We will fix that in Task 3.

That's expected. Proceed to commit; Task 3 will close the typecheck gap.

- [ ] **Step 10: Commit (with known typecheck gap)**

The interim commit between Tasks 2 and 3 will not typecheck cleanly because `worker.ts` hasn't been updated yet. To keep the build runnable without skipping verification across the boundary, add a TEMPORARY default-arg fallback in `shell.ts` and `svg.ts` so existing callers still compile.

Replace the type declarations with optional fields:

```ts
export type PlexiInputs = {
  contours: GlyphContours;
  totalDepth: number;
  rabbetDepth: number;
  wallThickness: number;
  insetWidth: number;
  plexiTolerance?: number;
};
```

(and similarly for `LayerInputs`.)

Then read `plexiTolerance` defensively inside the function body:

In `buildLetterPlexi`:
```ts
  const tol = input.plexiTolerance ?? 0;
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-(lipWidth + tol), "Round");
```

In `buildLetterLayers`:
```ts
  const tol = input.plexiTolerance ?? 0;
  ...
  const rabbetCut = outer.offset(-(lipWidth + tol), "Round");
```

This keeps the type backward-compatible (`worker.ts` callers without the field still compile and behave as tolerance=0). Task 3 then drops the `?` and updates the worker to pass the real value. The unit tests added in this task supply explicit values, so they exercise both code paths.

After making these changes:

```bash
npm run lint && npx tsc --noEmit
```
Expected: clean.

```bash
npm test
```
Expected: PASS for all.

Then commit:

```bash
git add src/geometry/shell.ts src/exporters/svg.ts \
  tests/unit/geometry/shell.test.ts tests/unit/exporters/svg.test.ts
git commit -m "feat: plexiTolerance shrinks plexi geometry

buildLetterPlexi and buildLetterLayers gain an optional
plexiTolerance field; the inner offset becomes
-(lipWidth + plexiTolerance) so the produced mesh and SVG
polygons fit inside the rabbet recess by the requested
clearance. Field is optional pending Task 3, where the worker
threads it through and the optionality is dropped."
```

---

## Task 3: Worker passes plexiTolerance through; UI control

**Files:**
- Modify: `src/geometry/shell.ts`
- Modify: `src/exporters/svg.ts`
- Modify: `src/geometry/worker.ts`
- Modify: `src/geometry/worker-client.ts`
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Drop the temporary optionality from PlexiInputs/LayerInputs**

In `src/geometry/shell.ts`, change:

```ts
  plexiTolerance?: number;
```

back to:

```ts
  plexiTolerance: number;
```

And in `buildLetterPlexi`, remove the `tol` fallback. The lines should now be:

```ts
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-(lipWidth + input.plexiTolerance), "Round");
```

In `src/exporters/svg.ts`, do the analogous change: drop `?` from `plexiTolerance: number;` and remove the `tol` fallback so the function reads `input.plexiTolerance` directly.

- [ ] **Step 2: Update `worker.ts` callers**

In `src/geometry/worker.ts`, find the two calls — `buildLetterPlexi({...})` and `buildLetterLayers({...})` — and add `plexiTolerance: req.params.plexiTolerance,` to each input object. The complete updated calls should match:

```ts
    const plexiRaw = await buildLetterPlexi({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      rabbetDepth: req.params.rabbetDepth,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
      plexiTolerance: req.params.plexiTolerance,
    });
```

```ts
    const layerResult = await buildLetterLayers({
      contours: comp.mergedContours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
      plexiTolerance: req.params.plexiTolerance,
    });
```

- [ ] **Step 3: Update `worker-client.ts` payload**

In `src/geometry/worker-client.ts`, find the `plainParams` object inside `build()` and add `plexiTolerance: params.plexiTolerance,` after `bridgeY`. The complete updated `plainParams` literal should match:

```ts
  const plainParams: Parameters = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
    plexiTolerance: params.plexiTolerance,
  };
```

- [ ] **Step 4: Add the UI control**

In `src/ui/ControlsPanel.tsx`, find the "Plexi inset" `<fieldset>` and add a new `NumberField` for plexi tolerance after the `Inset width` field, before the `<PlexiToggle />`:

```tsx
        <NumberField
          label="Plexi tolerance"
          unit="mm"
          value={params.plexiTolerance}
          onChange={(v) => params.set({ plexiTolerance: v })}
          error={errorFor(errs, "plexiTolerance")}
          step={0.05}
        />
```

- [ ] **Step 5: Run all tests, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean. 70 unit tests pass plus the 2 new ones from Task 2 (now 72 total). Note: the count may vary if other concurrent edits added tests; verify the suite passes overall.

- [ ] **Step 6: Smoke-check in the browser**

Run: `npm run dev` (in background)

Open <http://localhost:5173>. Confirm the "Plexi tolerance" field appears in the Plexi inset section showing `0.2`. Confirm BURGER still renders. Adjust to `0.5` and confirm the visible plexi shrinks slightly (look closely; at 0.5 mm the difference is subtle but real).

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/shell.ts src/exporters/svg.ts src/geometry/worker.ts \
  src/geometry/worker-client.ts src/ui/ControlsPanel.tsx
git commit -m "feat: thread plexiTolerance through worker and UI

Drops the temporary optional default from PlexiInputs and
LayerInputs; the worker now passes plexiTolerance from
parameters into both calls. Adds a NumberField in the Plexi
inset section. The plexi mesh in the preview now reflects the
exact geometry that will land in the export STL."
```

---

## Task 4: Zip layout refactor (folders, suffixes, three-array `bundleAll`)

**Files:**
- Modify: `src/exporters/zip.ts`
- Modify: `src/ui/ExportButtons.tsx`
- Modify: `tests/unit/exporters/zip.test.ts`

- [ ] **Step 1: Replace `bundleAll` test cases**

In `tests/unit/exporters/zip.test.ts`, replace the entire file contents with:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleAll } from "../../../src/exporters/zip";

describe("bundleAll", () => {
  it("places shells under stl/chars/ with _char suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_BURGER_char.stl")).toBeTruthy();
  });

  it("places plexi STLs under stl/plexi/ with _plexi suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/plexi/01_BURGER_plexi.stl")).toBeTruthy();
  });

  it("places plexi SVGs under svg/ with _plexi suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      [{ chars: "BURGER", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("svg/01_BURGER_plexi.svg")).toBeTruthy();
  });

  it("packs a full multi-component export", async () => {
    const blob = await bundleAll(
      [
        { chars: "M", stl: new ArrayBuffer(84) },
        { chars: "i", stl: new ArrayBuffer(84) },
      ],
      [
        { chars: "M", stl: new ArrayBuffer(84) },
        { chars: "i", stl: new ArrayBuffer(84) },
      ],
      [
        { chars: "M", svg: "<svg/>" },
        { chars: "i", svg: "<svg/>" },
      ],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_M_char.stl")).toBeTruthy();
    expect(zip.file("stl/chars/02_i_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_M_plexi.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/02_i_plexi.stl")).toBeTruthy();
    expect(zip.file("svg/01_M_plexi.svg")).toBeTruthy();
    expect(zip.file("svg/02_i_plexi.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
  });

  it("a component without plexi still ships a shell, but no plexi files", async () => {
    const blob = await bundleAll(
      [
        { chars: "A", stl: new ArrayBuffer(84) },
        { chars: "B", stl: new ArrayBuffer(84) },
      ],
      [
        // No plexi for A; only B.
        { chars: "B", stl: new ArrayBuffer(84) },
      ],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_A_char.stl")).toBeTruthy();
    expect(zip.file("stl/chars/02_B_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_B_plexi.stl")).toBeTruthy();
    // No 02_A or 02_B with index mismatch — plexi list is independent slot order.
  });

  it("falls back to component<slot> for non-alphanumeric chars", async () => {
    const blob = await bundleAll(
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_component1_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_component1_plexi.stl")).toBeTruthy();
    expect(zip.file("svg/01_component1_plexi.svg")).toBeTruthy();
  });

  it("strips disallowed characters", async () => {
    const blob = await bundleAll(
      [{ chars: "Hi/?", stl: new ArrayBuffer(84) }],
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_Hi_char.stl")).toBeTruthy();
  });

  it("README content lands at the root", async () => {
    const readme = "Reproduce: http://example.com/?p=...\nText: BURGER";
    const blob = await bundleAll([], [], [], readme);
    const zip = await JSZip.loadAsync(blob);
    const f = zip.file("README.txt");
    expect(f).toBeTruthy();
    if (f) expect(await f.async("text")).toBe(readme);
  });

  it("does not emit the old layout paths", async () => {
    const blob = await bundleAll(
      [{ chars: "M", stl: new ArrayBuffer(84) }],
      [{ chars: "M", stl: new ArrayBuffer(84) }],
      [{ chars: "M", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_M.stl")).toBeNull();
    expect(zip.file("plexi/01_M.svg")).toBeNull();
    expect(zip.file("manifest.json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify all fail**

Run: `npx vitest run tests/unit/exporters/zip.test.ts`
Expected: FAIL — the new signature isn't implemented yet.

- [ ] **Step 3: Replace `src/exporters/zip.ts`**

Replace the entire file contents with:

```ts
import JSZip from "jszip";

function safeFilenameFragment(chars: string, fallback: string): string {
  const cleaned = chars.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type ShellEntry = { chars: string; stl: ArrayBuffer };
export type PlexiStlEntry = { chars: string; stl: ArrayBuffer };
export type PlexiSvgEntry = { chars: string; svg: string };

// Bundle one zip with three role-grouped folders plus a README at the root:
//   stl/chars/NN_<chars>_char.stl   — printable letter shells
//   stl/plexi/NN_<chars>_plexi.stl  — printable plexi inserts
//   svg/NN_<chars>_plexi.svg        — laser-cut plexi cut sheets
//
// Filenames carry a literal _char or _plexi suffix so a file moved out of
// its folder still self-describes. Slot index is the array position
// (1-based, zero-padded). A component without a plexi just doesn't appear
// in the plexi arrays — its shell still ships under stl/chars.
export async function bundleAll(
  shells: ShellEntry[],
  plexiStls: PlexiStlEntry[],
  plexiSvgs: PlexiSvgEntry[],
  readme: string,
): Promise<Blob> {
  const zip = new JSZip();
  const stlChars = zip.folder("stl/chars");
  const stlPlexi = zip.folder("stl/plexi");
  const svgDir = zip.folder("svg");
  if (!stlChars || !stlPlexi || !svgDir) throw new Error("zip folder creation failed");

  shells.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_char.stl`;
    stlChars.file(name, e.stl);
  });
  plexiStls.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_plexi.stl`;
    stlPlexi.file(name, e.stl);
  });
  plexiSvgs.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_plexi.svg`;
    svgDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 4: Update `ExportButtons.tsx` to use the new signature**

In `src/ui/ExportButtons.tsx`, replace the `exportZip` function body to compute three arrays and pass them:

```tsx
  async function exportZip() {
    if (!result || result.components.length === 0) return;
    setBusy(true);
    try {
      const shells = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
      }));
      const plexiStls = result.components
        .filter((c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null)
        .map((c) => ({
          chars: c.members.map((m) => m.char).join(""),
          stl: meshToBinarySTL({
            vertProperties: c.plexi.vertProperties,
            triVerts: c.plexi.triVerts,
          }),
        }));
      const plexiSvgs = result.layers.map((l) => ({
        chars: l.members.map((m) => m.char).join(""),
        svg: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
      const pieces = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        count: c.members.length,
      }));
      const readme = buildReadme(params, buildReproduceUrl(params), pieces);
      const blob = await bundleAll(shells, plexiStls, plexiSvgs, readme);
      saveAs(blob, `lightbox-${Date.now()}.zip`);
    } finally {
      setBusy(false);
    }
  }
```

(The `lightbox-${Date.now()}.zip` filename is intentionally kept as-is in this task — the new ISO-timestamp-with-text filename lands in Task 6.)

Also in `buildReproduceUrl`, add `plexiTolerance: params.plexiTolerance,` after `bridgeY: params.bridgeY,`. The complete updated `serializable` object literal should match:

```tsx
  const serializable = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
    plexiTolerance: params.plexiTolerance,
  };
```

- [ ] **Step 5: Run zip tests, verify pass**

Run: `npx vitest run tests/unit/exporters/zip.test.ts`
Expected: PASS for all 9 cases.

- [ ] **Step 6: Run full suite, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean. The e2e test `tests/e2e/smoke.spec.ts` will fail in `npm run e2e` because it asserts the OLD layout — that's intentional; Task 7 updates it. Don't run the e2e here.

- [ ] **Step 7: Commit**

```bash
git add src/exporters/zip.ts src/ui/ExportButtons.tsx tests/unit/exporters/zip.test.ts
git commit -m "refactor: zip layout — stl/chars, stl/plexi, svg with role suffixes

bundleAll signature becomes (shells, plexiStls, plexiSvgs, readme).
Filenames carry _char / _plexi suffixes so a moved file still
self-describes. ExportButtons computes plexi STLs from
component.plexi (filtering components without plexi). E2E will
be updated in Task 7."
```

---

## Task 5: README updates

**Files:**
- Modify: `src/exporters/manifest.ts`
- Modify: `tests/unit/exporters/manifest.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/unit/exporters/manifest.test.ts`, append a new `it` block inside the existing `describe("buildReadme", ...)`:

```ts
  it("includes plexiTolerance and the new file-tree paths", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, plexiTolerance: 0.25 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Plexi tolerance:    0.25 mm");
    expect(txt).toContain("stl/chars/");
    expect(txt).toContain("stl/plexi/");
    expect(txt).toContain("svg/");
    // Old paths must not appear:
    expect(txt).not.toContain("stl/NN_<chars>.stl");
    expect(txt).not.toContain("plexi/NN_<chars>.svg");
  });
```

Note the column alignment: 4 spaces between `Plexi tolerance:` and the value to match the existing 19-character column convention. Verify by counting the spaces in the existing parameter lines in `src/exporters/manifest.ts`.

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: FAIL — `Plexi tolerance:` is not printed and the file-tree paths don't match.

- [ ] **Step 3: Update `buildReadme`**

In `src/exporters/manifest.ts`, replace the `lines` array's parameter and file-tree sections to match. The complete updated `lines` initialization should be:

```ts
  const lines: string[] = [
    `Lightbox letter generator output`,
    ``,
    `Generated:  ${new Date().toISOString()}`,
    ``,
    `Reproduce this download:`,
    `  ${reproduceUrl}`,
    ``,
    `Parameters:`,
    `  Text:              ${params.text}`,
    `  Font:              ${describeFont(params.fontSource)}`,
    `  Letter height:     ${params.letterHeight} mm`,
    `  Wall thickness:    ${params.wallThickness} mm`,
    `  Total depth:       ${params.totalDepth} mm`,
    `  Back thickness:    ${params.backThickness} mm`,
    `  Rabbet depth:      ${params.rabbetDepth} mm`,
    `  Inset width:       ${params.insetWidth} mm`,
    `  Bezier tolerance:  ${params.bezierTolerance} mm`,
    `  Letter overlap:    ${params.letterOverlap} mm`,
    `  Bridge width:      ${params.bridgeWidth} mm`,
    `  Bridge height:     ${params.bridgeHeight} mm`,
    `  Bridge Y:          ${params.bridgeY} mm`,
    `  Plexi tolerance:   ${params.plexiTolerance} mm`,
    ``,
    `Files in this archive:`,
    `  stl/chars/NN_<chars>_char.stl    — 3D-printable letter shells`,
    `  stl/plexi/NN_<chars>_plexi.stl   — 3D-printable plexi inserts`,
    `  svg/NN_<chars>_plexi.svg          — plexi cut shapes (cut these from acrylic)`,
    ``,
    `NN preserves left-to-right order. Spaces are skipped. Each component`,
    `produces up to three files (shell STL, plexi STL, plexi SVG) sharing`,
    `the same NN slot index.`,
    ``,
  ];
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: PASS for all manifest tests.

- [ ] **Step 5: Run full suite, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean (excluding e2e).

- [ ] **Step 6: Commit**

```bash
git add src/exporters/manifest.ts tests/unit/exporters/manifest.test.ts
git commit -m "feat: README documents plexi tolerance and new file tree

buildReadme prints Plexi tolerance in the parameter dump and
describes the new stl/chars, stl/plexi, svg layout in the file
tree section."
```

---

## Task 6: Zip filename with text and local ISO timestamp

**Files:**
- Create: `src/exporters/filename.ts`
- Create: `tests/unit/exporters/filename.test.ts`
- Modify: `src/ui/ExportButtons.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/exporters/filename.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildZipFilename } from "../../../src/exporters/filename";

describe("buildZipFilename", () => {
  // Use a Date instance directly so we don't depend on the host timezone:
  // Date constructed from local components (Y, M, D, h, m, s) — getFullYear()
  // etc. return those exact components regardless of where the test runs.
  const localDate = new Date(2026, 5, 9, 14, 34, 56); // June 9 2026, 14:34:56 local

  it("includes a sanitized text and local-timezone ISO timestamp", () => {
    expect(buildZipFilename("BURGER", localDate)).toBe(
      "lightbox-BURGER-2026-06-09T14-34-56.zip",
    );
  });

  it("replaces whitespace with underscores", () => {
    expect(buildZipFilename("HELLO WORLD", localDate)).toBe(
      "lightbox-HELLO_WORLD-2026-06-09T14-34-56.zip",
    );
  });

  it("strips characters outside [A-Za-z0-9_-]", () => {
    expect(buildZipFilename("Hi!?", localDate)).toBe(
      "lightbox-Hi-2026-06-09T14-34-56.zip",
    );
  });

  it("omits the text segment when sanitization produces an empty string", () => {
    expect(buildZipFilename("??", localDate)).toBe(
      "lightbox-2026-06-09T14-34-56.zip",
    );
  });

  it("omits the text segment when text is empty", () => {
    expect(buildZipFilename("", localDate)).toBe(
      "lightbox-2026-06-09T14-34-56.zip",
    );
  });

  it("zero-pads single-digit components", () => {
    const d = new Date(2026, 0, 1, 1, 2, 3); // Jan 1 2026, 01:02:03
    expect(buildZipFilename("A", d)).toBe("lightbox-A-2026-01-01T01-02-03.zip");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/unit/exporters/filename.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildZipFilename`**

Create `src/exporters/filename.ts`:

```ts
// Sanitize the source text for use as a filename segment.
// Replace whitespace with underscores, then drop anything not in [A-Za-z0-9_-].
function sanitizeText(text: string): string {
  return text.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
}

// Format a Date as YYYY-MM-DDTHH-MM-SS in the browser's local timezone.
// Colons are replaced with dashes for filesystem safety; no fractional
// seconds, no `Z` suffix, no offset — local-machine-only readability.
function localIsoFilename(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

// Build the download filename for the export zip. Format:
//   lightbox-<sanitizedText>-<localIso>.zip
// If the sanitized text is empty, the text segment (and its leading dash)
// is omitted.
export function buildZipFilename(text: string, date: Date): string {
  const t = sanitizeText(text);
  const iso = localIsoFilename(date);
  return t.length > 0 ? `lightbox-${t}-${iso}.zip` : `lightbox-${iso}.zip`;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/exporters/filename.test.ts`
Expected: PASS for all 6 cases.

- [ ] **Step 5: Wire `buildZipFilename` into ExportButtons**

In `src/ui/ExportButtons.tsx`, add the import:

```tsx
import { buildZipFilename } from "../exporters/filename";
```

In the `exportZip` function, replace:

```tsx
      saveAs(blob, `lightbox-${Date.now()}.zip`);
```

with:

```tsx
      saveAs(blob, buildZipFilename(params.text, new Date()));
```

- [ ] **Step 6: Run full suite, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Smoke-check in the browser**

Run: `npm run dev` (in background)

Open <http://localhost:5173>, click Download. Confirm the downloaded zip filename starts with `lightbox-BURGER-` and includes a timestamp segment that matches your local clock.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/exporters/filename.ts tests/unit/exporters/filename.test.ts \
  src/ui/ExportButtons.tsx
git commit -m "feat: zip filename includes text and local ISO timestamp

lightbox-<text>-YYYY-MM-DDTHH-MM-SS.zip in the user's local
timezone. Sanitization: whitespace to underscore, then drop
non-[A-Za-z0-9_-]. Empty result omits the text segment.
Pure helper in src/exporters/filename.ts; unit-tested with
locally-constructed Date instances so behavior is independent
of the test host's timezone."
```

---

## Task 7: E2E smoke covers new layout

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Replace `tests/e2e/smoke.spec.ts`**

Replace the entire file contents with:

```ts
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, download zip", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // Filename starts with lightbox-Hi- and ends in .zip; the middle is the
  // local-time ISO segment which we don't pin precisely.
  expect(download.suggestedFilename()).toMatch(/^lightbox-Hi-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // New layout: stl/chars, stl/plexi, svg.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeTruthy();
  expect(zip.file("stl/chars/02_i_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_H_plexi.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/02_i_plexi.stl")).toBeTruthy();
  expect(zip.file("svg/01_H_plexi.svg")).toBeTruthy();
  expect(zip.file("svg/02_i_plexi.svg")).toBeTruthy();

  // Old layout must not survive.
  expect(zip.file("stl/01_H.stl")).toBeNull();
  expect(zip.file("plexi/01_H.svg")).toBeNull();
  expect(zip.file("manifest.json")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Reproduce");
    expect(text).toContain("?p=");
    expect(text).toContain("Hi");
    expect(text).toContain("Plexi tolerance:");
    expect(text).toContain("stl/chars/");
  }
});

test("end-to-end: connected mode merges letters into one STL", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");
  // Pull H and i together far enough that their outlines overlap.
  // Anton (the bundled default font) at letterHeight=80 produces an "H"
  // whose advance leaves enough gap that an overlap of 30mm reliably
  // merges the two letters. If a future font change breaks this, bump
  // the value (40, 50, ...) until the merge fires.
  await page.getByLabel("Letter overlap").fill("30");

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  expect(download.suggestedFilename()).toMatch(/^lightbox-Hi-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // One merged shell + one merged plexi STL + one merged plexi SVG.
  expect(zip.file("stl/chars/01_Hi_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_Hi_plexi.stl")).toBeTruthy();
  expect(zip.file("svg/01_Hi_plexi.svg")).toBeTruthy();
  // No per-letter files.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeNull();
  expect(zip.file("stl/chars/02_i_char.stl")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Pieces:");
    expect(text).toContain("01_Hi");
    expect(text).toContain("Letter overlap:");
    expect(text).toContain("Plexi tolerance:");
  }
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e`
Expected: both tests PASS.

- [ ] **Step 3: Final regression check**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "test: e2e covers new zip layout and filename pattern

Asserts the stl/chars, stl/plexi, svg folder structure with
_char and _plexi filename suffixes; asserts the download
filename matches lightbox-<text>-YYYY-MM-DDTHH-MM-SS.zip.
Connected-mode test mirrored to the same layout."
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Export format section**

In `CLAUDE.md`, find the `## Export format` section. Replace its file-tree block with:

```
lightbox-<text>-<localIso>.zip
├── README.txt              # human-readable params + reproduce URL
├── stl/
│   ├── chars/01_<chars>_char.stl   # printable letter shells
│   └── plexi/01_<chars>_plexi.stl  # printable plexi inserts
└── svg/01_<chars>_plexi.svg         # laser-cut plexi sheets
```

Replace the surrounding paragraph(s) about filenames with:

```
- One entry point: `bundleAll(shells, plexiStls, plexiSvgs, readme)`.
- Each component shares a slot index (1-based, zero-padded). `<chars>` is the joined member chars, sanitized to `[A-Za-z0-9_-]`; the per-file fallback is `componentNN`. Filenames carry a literal `_char` or `_plexi` suffix so a file moved out of its folder is still self-describing.
- Components without a plexi (e.g. offset_collapsed) skip the `stl/plexi/` and `svg/` slots; the shell still ships under `stl/chars/`.
- Zip filename: `lightbox-<sanitizedText>-<localIso>.zip` where `<localIso>` is `YYYY-MM-DDTHH-MM-SS` in the browser's local timezone. Built by `src/exporters/filename.ts`.
- `buildReadme(params, reproduceUrl, pieces?)` produces the README text. The reproduce URL is built from `window.location.origin + window.location.pathname + "?p=" + JSON.stringify(serializableParams)` in `ExportButtons`.
```

- [ ] **Step 2: Add a note in Plexi/rabbet section**

In `CLAUDE.md`, find the `## Plexi/rabbet semantics` section. Append a bullet at the end:

```
- `plexiTolerance` (default 0.2 mm) shrinks the plexi geometry inward by that amount so a 3D-printed or laser-cut insert drops into the rabbet recess. The same tolerance applies to the STL mesh, the SVG cut sheet, and the preview render — one shape, one source of truth. Validation enforces `0 ≤ plexiTolerance < (wallThickness − insetWidth)`; values at or above the upper bound collapse the insert.
```

- [ ] **Step 3: Update test count**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5` and note the test count. In `CLAUDE.md`, find the line in the `## Tests` section that reads `69 Vitest unit tests` (or whatever the current number is) and update it to the actual current count.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for printable plexi mode"
```

---

## Self-review

**Spec coverage:**
- New parameter `plexiTolerance` with default 0.2 → Task 1 ✓
- Geometry shrink applied in `buildLetterPlexi` and `buildLetterLayers` → Task 2 ✓
- Worker passes the value through → Task 3 ✓
- UI control in Plexi inset section → Task 3 ✓
- New zip layout (`stl/chars`, `stl/plexi`, `svg`) with `_char`/`_plexi` suffixes → Task 4 ✓
- README: prints new param, describes new file tree → Task 5 ✓
- Zip filename with sanitized text + local ISO timestamp → Task 6 ✓
- E2E covers all of the above → Task 7 ✓
- CLAUDE.md updated → Task 8 ✓
- Validation rules including upper bound → Task 1 ✓
- Persistence migration for old saves → Task 1 ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later" lines. Every code-step has a complete code block. The "expected: clean" lines have explicit notes when something is intentionally still failing (Task 2 step 9, Task 4 step 6).

**Type consistency:**
- `PlexiInputs.plexiTolerance` is added in Task 2 (optional with `?`), made required in Task 3.
- `LayerInputs.plexiTolerance` follows the same pattern.
- `bundleAll(shells, plexiStls, plexiSvgs, readme)` signature is consistent across Task 4 (zip.ts), Task 4 step 4 (ExportButtons call site), and Task 7 (e2e expectations).
- New types `ShellEntry`, `PlexiStlEntry`, `PlexiSvgEntry` defined in Task 4, used internally by `bundleAll`.
- Filename helper `buildZipFilename(text: string, date: Date): string` defined in Task 6, called from ExportButtons in the same task.
- `safeFilenameFragment` continues to take `(chars, fallback)` and is unchanged across the refactor.
- `Parameters.plexiTolerance` is added in Task 1 and consumed in Tasks 2, 3, 4, 5, 6.

No inconsistencies found.

**Scope check:** This plan covers one feature with one user-visible parameter and one zip layout refactor. The two are tightly coupled (the new STL needs a place to land) and form a single cohesive change.
