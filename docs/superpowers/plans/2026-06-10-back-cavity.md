# Back Cavity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hollow rear cavity behind each letter shell with a configurable depth (default 20 mm), so users can mount LEDs / electronics inside and access them from the open back.

**Architecture:** New `backCavityDepth` parameter (mm). The perimeter wall extends behind the existing back panel — the back panel becomes an internal partition between two cavities. The shell mesh's coordinate system shifts so Z=0 is at the open back (lowest face) and Z=`totalDepth + backCavityDepth` is at the front face. Setting `backCavityDepth = 0` collapses to today's exact geometry.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Vite, React 19, manifold-3d (WASM via Web Worker), zustand, Vitest, Playwright.

**Spec reference:** `docs/superpowers/specs/2026-06-10-back-cavity-design.md`

---

## File Structure

**Modified:**
- `src/state/parameters.ts` — `backCavityDepth` field, default `20`.
- `src/state/persistence.ts` — `migrate()` fills the new field.
- `src/geometry/validate.ts` — `≥ 0`, finite.
- `src/geometry/shell.ts` — `ShellInputs.backCavityDepth`, restructured extrusion in `buildLetterShell`; `PlexiInputs.backCavityDepth`, updated Z translation in `buildLetterPlexi`.
- `src/geometry/worker.ts` — passes `backCavityDepth` to both builders.
- `src/geometry/worker-client.ts` — `plainParams` includes the field.
- `src/exporters/manifest.ts` — README parameter line.
- `src/ui/ControlsPanel.tsx` — new `NumberField` in Walls fieldset.
- `src/ui/ExportButtons.tsx` — `buildReproduceUrl` serializable adds the field.
- `tests/unit/geometry/shell.test.ts` — new tests for backCavityDepth=0 (today's behavior preserved) and backCavityDepth>0 (Z range grew).
- `tests/unit/state/parameters.test.ts` — defaults.
- `tests/unit/state/persistence.test.ts` — `migrate()` cases.
- `tests/unit/geometry/validate.test.ts` — bounds.
- `tests/unit/exporters/manifest.test.ts` — README contains the new line.
- `CLAUDE.md` — coordinate system update + spec reference + test count.

---

## Task 1: Parameter — state, persistence, validation

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `tests/unit/state/parameters.test.ts`
- Modify: `tests/unit/state/persistence.test.ts`
- Modify: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write failing parameters-store test**

In `tests/unit/state/parameters.test.ts`, add this expectation inside the existing "starts with defaults" test, just before the closing `});`:

```ts
    expect(state.backCavityDepth).toBe(20);
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: FAIL — `state.backCavityDepth` is undefined.

- [ ] **Step 3: Add the field with default**

In `src/state/parameters.ts`, add `backCavityDepth: number;` to the `Parameters` type after `plexiTolerance`. Add `backCavityDepth: 20,` to `DEFAULT_PARAMETERS` after `plexiTolerance: 0.1,` (just before the closing brace).

The complete updated file should read:

```ts
import { create } from "zustand";

export type FontSource =
  | { kind: "bundled"; id: string }
  | { kind: "uploaded"; name: string; sha256: string };

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
  backCavityDepth: number;
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
  plexiTolerance: 0.1,
  backCavityDepth: 20,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing persistence tests**

In `tests/unit/state/persistence.test.ts`, append three new `it` blocks inside the existing `describe("persistence migrate", ...)` block (just before the closing `});` of the describe):

```ts
  it("fills backCavityDepth default when missing", () => {
    const out = migrate({
      letterHeight: 200,
      wallThickness: 10,
    });
    expect(out.backCavityDepth).toBe(20);
  });

  it("preserves an existing backCavityDepth value", () => {
    const out = migrate({
      letterHeight: 200,
      backCavityDepth: 35,
    });
    expect(out.backCavityDepth).toBe(35);
  });

  it("preserves backCavityDepth: 0 (falsy but valid)", () => {
    const out = migrate({ letterHeight: 200, backCavityDepth: 0 });
    expect(out.backCavityDepth).toBe(0);
  });
```

- [ ] **Step 6: Run, verify failure**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: FAIL — `out.backCavityDepth` is undefined.

- [ ] **Step 7: Update `persistence.ts`**

In `src/state/persistence.ts`, in the `migrate` function find the existing block of conditional defaults. Just before `return out as Partial<Parameters>;`, add:

```ts
  if (typeof out.backCavityDepth !== "number") {
    out.backCavityDepth = DEFAULT_PARAMETERS.backCavityDepth;
  }
```

Inside `initPersistence`, find the `ser` literal and add `backCavityDepth: state.backCavityDepth,` after `plexiTolerance: state.plexiTolerance,`. The complete updated `ser` literal should match:

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
      backCavityDepth: state.backCavityDepth,
    };
```

- [ ] **Step 8: Run persistence test, verify pass**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 9: Write failing validation tests**

In `tests/unit/geometry/validate.test.ts`, append a new `describe` block just before the file's final `});`:

```ts
describe("backCavityDepth bounds", () => {
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
    plexiTolerance: 0.1,
    backCavityDepth: 20,
  };

  it("accepts the default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts zero", () => {
    expect(validate({ ...base, backCavityDepth: 0 }).ok).toBe(true);
  });

  it("rejects negative", () => {
    expect(validate({ ...base, backCavityDepth: -1 }).ok).toBe(false);
  });

  it("rejects non-finite", () => {
    expect(validate({ ...base, backCavityDepth: NaN }).ok).toBe(false);
  });
});
```

Note: this fixture's `base` value of `backCavityDepth: 20` is required to make the typecheck happy when `Parameters` includes the new required field. The pre-existing `connected-letters bounds` and `plexiTolerance bounds` fixtures must also be updated — see next step.

- [ ] **Step 10: Update existing validate fixtures with backCavityDepth**

In the same `tests/unit/geometry/validate.test.ts`, find the `connected-letters bounds` `base` literal and the `plexiTolerance bounds` `base` literal. Add `backCavityDepth: 20,` to each (placed at the end of each base object, before the closing brace). The fixtures previously read:

```ts
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
  plexiTolerance: 0.2, // or 0.1 depending on which bounds block
};
```

After the edit, each fixture has `backCavityDepth: 20,` appended. No semantics change — these fields are required by `Parameters` and weren't previously checked, so adding them is purely a typecheck fix.

- [ ] **Step 11: Run, verify failure**

Run: `npx vitest run tests/unit/geometry/validate.test.ts`
Expected: FAIL — the new field is not validated yet (the new `describe` block's "rejects negative" and "rejects non-finite" tests fail).

- [ ] **Step 12: Add validation rules**

In `src/geometry/validate.ts`, find the `plexiTolerance` validation block at the bottom of `validate()`. Just before `return errors.length === 0 ? { ok: true } : { ok: false, errors };`, add:

```ts
  if (!Number.isFinite(p.backCavityDepth) || p.backCavityDepth < 0) {
    errors.push({ field: "backCavityDepth", message: "Back cavity depth must be ≥ 0" });
  }
```

- [ ] **Step 13: Run all tests, verify pass**

Run: `npx vitest run tests/unit/geometry/validate.test.ts tests/unit/state/`
Expected: all PASS.

- [ ] **Step 14: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 15: Commit**

```bash
git add src/state/parameters.ts src/state/persistence.ts src/geometry/validate.ts \
  tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
  tests/unit/geometry/validate.test.ts
git commit -m "feat: add backCavityDepth parameter (default 20mm)

State + persistence migration + validation. Field is the depth
of a hollow rear cavity behind the letter's existing back
panel; the perimeter walls extend backward by this amount.
Default 20mm. Validation: >= 0 and finite.

Geometry doesn't consume the field yet — that lands in Task 2."
```

---

## Task 2: Geometry — extend `buildLetterShell` and `buildLetterPlexi`

**Files:**
- Modify: `src/geometry/shell.ts`
- Modify: `src/geometry/worker.ts`
- Modify: `src/geometry/worker-client.ts`
- Modify: `tests/unit/geometry/shell.test.ts`

This task adds the field as REQUIRED on `ShellInputs` and `PlexiInputs`, restructures the extrusion in `buildLetterShell` to add the rear cavity, updates `buildLetterPlexi`'s Z translation, and threads the value through the worker. All caller sites are updated in the same commit so the build stays green.

- [ ] **Step 1: Write failing tests**

In `tests/unit/geometry/shell.test.ts`, append a new `describe` block just before the file's final `});`:

```ts
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
```

Also update the existing `buildLetterShell` tests' `baseInputs` literal at the top of the file to add `backCavityDepth: 0`. The complete updated `baseInputs` literal in the existing top-of-file `describe("buildLetterShell", ...)` block should match:

```ts
  const baseInputs: Omit<ShellInputs, "contours"> = {
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 5,
    rabbetDepth: 3,
    insetWidth: 3,
    backCavityDepth: 0,
  };
```

Also update the existing `buildLetterPlexi tolerance` test's `base` literal to add `backCavityDepth: 0`. That literal currently reads:

```ts
const base = { contours, totalDepth: 25, rabbetDepth: 3, wallThickness: 5, insetWidth: 3 };
```

After the edit:

```ts
const base = { contours, totalDepth: 25, rabbetDepth: 3, wallThickness: 5, insetWidth: 3, backCavityDepth: 0 };
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/unit/geometry/shell.test.ts`
Expected: FAIL — `buildLetterShell` doesn't accept `backCavityDepth`; the existing tests' fixtures don't typecheck.

- [ ] **Step 3: Add `backCavityDepth` to `ShellInputs` and restructure extrusion**

In `src/geometry/shell.ts`, add `backCavityDepth: number;` to the `ShellInputs` type after `insetWidth`. Replace the body of `buildLetterShell` with the new extrusion pattern:

```ts
export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  insetWidth: number; // shelf width where the plexi rests; lip = wallThickness − insetWidth
  backCavityDepth: number; // hollow cavity behind the back panel; 0 = today's flat-back behavior
};

export type ShellMeshResult =
  | {
      ok: true;
      mesh: { vertProperties: Float32Array; triVerts: Uint32Array };
    }
  | { ok: false; reason: "offset_collapsed" | "no_contours" };

export async function buildLetterShell(input: ShellInputs): Promise<ShellMeshResult> {
  if (input.contours.length === 0) {
    return { ok: false, reason: "no_contours" };
  }

  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero");
  const cavity = outer.offset(-input.wallThickness, "Round");
  const lipWidth = input.wallThickness - input.insetWidth;
  const rabbetCut = outer.offset(-lipWidth, "Round");

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete();
    cavity.delete();
    rabbetCut.delete();
    return { ok: false, reason: "offset_collapsed" };
  }

  // Coordinate system: Z=0 is the lowest face (open back when backCavityDepth>0,
  // back panel when backCavityDepth=0). Z=top is the front face.
  const top = input.totalDepth + input.backCavityDepth;

  const outerPrism = outer.extrude(top);

  // Front cavity: above the internal panel, up to the front face.
  const frontCavityHeight = top - (input.backCavityDepth + input.backThickness);
  const frontCavityExtruded = cavity.extrude(frontCavityHeight);
  const frontCavityPrism = frontCavityExtruded.translate([
    0,
    0,
    input.backCavityDepth + input.backThickness,
  ]);

  // Rabbet step at the front face.
  const rabbetExtruded = rabbetCut.extrude(input.rabbetDepth);
  const rabbetPrism = rabbetExtruded.translate([0, 0, top - input.rabbetDepth]);

  // Always-present subtractions.
  const shellNoRear = outerPrism.subtract(frontCavityPrism).subtract(rabbetPrism);

  // Conditional rear cavity (skip the allocation entirely when backCavityDepth = 0).
  let shell;
  if (input.backCavityDepth > 0) {
    const rearCavityPrism = cavity.extrude(input.backCavityDepth);
    shell = shellNoRear.subtract(rearCavityPrism);
    shellNoRear.delete();
    rearCavityPrism.delete();
  } else {
    shell = shellNoRear;
  }

  const mesh = shell.getMesh();
  // Copy typed array views into owned arrays before any .delete() calls;
  // the views returned by getMesh() are windows into the WASM heap and
  // become unsafe to read once the manifold object is destroyed.
  const vertProperties = mesh.vertProperties.slice();
  const triVerts = mesh.triVerts.slice();

  outer.delete();
  cavity.delete();
  rabbetCut.delete();
  outerPrism.delete();
  frontCavityExtruded.delete();
  frontCavityPrism.delete();
  rabbetExtruded.delete();
  rabbetPrism.delete();
  shell.delete();

  return {
    ok: true,
    mesh: { vertProperties, triVerts },
  };
}
```

- [ ] **Step 4: Update `PlexiInputs` and `buildLetterPlexi`**

In the same file, add `backCavityDepth: number;` to `PlexiInputs` after `plexiTolerance`. Update the Z translation inside `buildLetterPlexi` to use `top - input.rabbetDepth` instead of `input.totalDepth - input.rabbetDepth`. The complete updated function:

```ts
export type PlexiInputs = {
  contours: GlyphContours;
  totalDepth: number;
  rabbetDepth: number;
  wallThickness: number;
  insetWidth: number;
  plexiTolerance: number;
  backCavityDepth: number;
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

  const top = input.totalDepth + input.backCavityDepth;
  const extruded = rabbetCut.extrude(input.rabbetDepth);
  const positioned = extruded.translate([0, 0, top - input.rabbetDepth]);
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

- [ ] **Step 5: Update worker.ts to pass `backCavityDepth`**

In `src/geometry/worker.ts`, find the two calls — `buildLetterShell({...})` and `buildLetterPlexi({...})` — and add `backCavityDepth: req.params.backCavityDepth,` to each input object. The complete updated calls:

```ts
    const meshResult = await buildLetterShell({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
      backCavityDepth: req.params.backCavityDepth,
    });
```

```ts
    const plexiRaw = await buildLetterPlexi({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      rabbetDepth: req.params.rabbetDepth,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
      plexiTolerance: req.params.plexiTolerance,
      backCavityDepth: req.params.backCavityDepth,
    });
```

- [ ] **Step 6: Update worker-client.ts plainParams**

In `src/geometry/worker-client.ts`, find the `plainParams` object literal inside `build()` and add `backCavityDepth: params.backCavityDepth,` after `plexiTolerance: params.plexiTolerance,`. The complete updated `plainParams` literal should match:

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
    backCavityDepth: params.backCavityDepth,
  };
```

- [ ] **Step 7: Run tests, lint, typecheck, build**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all clean. The two new shell tests pass; existing tests still pass; build succeeds.

- [ ] **Step 8: Smoke check in the browser**

Run: `npm run dev` (in background)

Open <http://localhost:5173>. Confirm BURGER renders. The letters should now be visibly chunkier (depth 100mm + 20mm rear cavity = 120mm Z extent total). Adjust the eventual `Back cavity depth` field once Task 3 lands; for now just confirm the geometry looks right.

If you can't open a browser, the unit tests already cover the Z range; `npm run build` succeeds means the worker compiles.

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/geometry/shell.ts src/geometry/worker.ts src/geometry/worker-client.ts \
  tests/unit/geometry/shell.test.ts
git commit -m "feat: backCavityDepth shapes shell and plexi geometry

buildLetterShell extrudes the outer prism by (totalDepth +
backCavityDepth). The front cavity sits above the internal
panel at Z=(backCavityDepth+backThickness); a new rear cavity
hollows out Z=[0, backCavityDepth] when the value is > 0.
buildLetterPlexi's Z translation tracks the new top.

Worker passes the field through; plainParams in worker-client
includes it. Setting backCavityDepth=0 reproduces today's exact
Z range [0, totalDepth] verified by unit test."
```

---

## Task 3: UI control + reproduce URL + README

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`
- Modify: `src/ui/ExportButtons.tsx`
- Modify: `src/exporters/manifest.ts`
- Modify: `tests/unit/exporters/manifest.test.ts`

- [ ] **Step 1: Write failing manifest test**

In `tests/unit/exporters/manifest.test.ts`, append a new `it` block inside the existing `describe("buildReadme", ...)`:

```ts
  it("includes backCavityDepth in the parameter dump", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, backCavityDepth: 35 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Back cavity depth: 35 mm");
  });
```

The label "Back cavity depth:" is 18 characters — one longer than the existing longest label ("Bezier tolerance:" at 17 chars). To preserve the column position (value starts at character 22) the line uses exactly **1 space** between the colon and the value, giving `Back cavity depth: 35 mm`. This breaks the visual rhythm slightly (other rows have 2+ spaces) but keeps every other label column unchanged.

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the line to `buildReadme`**

In `src/exporters/manifest.ts`, find the parameter dump in the `lines` array. Add a new entry right after `Plexi tolerance:`:

```ts
    `  Plexi tolerance:   ${params.plexiTolerance} mm`,
    `  Back cavity depth: ${params.backCavityDepth} mm`,
```

(Note the single space between `:` and the value template.)

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the UI control**

In `src/ui/ControlsPanel.tsx`, find the "Walls" `<fieldset>` and add a new `NumberField` after the `Back thickness` field:

```tsx
        <NumberField
          label="Back cavity depth"
          unit="mm"
          value={params.backCavityDepth}
          onChange={(v) => params.set({ backCavityDepth: v })}
          error={errorFor(errs, "backCavityDepth")}
          step={1}
        />
```

- [ ] **Step 6: Update `buildReproduceUrl` in `ExportButtons.tsx`**

In `src/ui/ExportButtons.tsx`, find `buildReproduceUrl`. Add `backCavityDepth: params.backCavityDepth,` to the `serializable` object after `plexiTolerance`. The complete updated `serializable` literal:

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
    backCavityDepth: params.backCavityDepth,
  };
```

- [ ] **Step 7: Run tests, lint, typecheck, build**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 8: Run e2e**

Run: `npm run e2e`
Expected: both existing tests still pass. The new geometry doesn't change zip layout, filenames, or README assertions in those tests.

- [ ] **Step 9: Smoke check in the browser**

Run: `npm run dev` (in background)

Open <http://localhost:5173>. Confirm:
- "Back cavity depth" field appears in the Walls section, default 20.
- Setting it to 0 reproduces a flat-back letter (look at the preview from a side angle).
- Setting it to 50 visibly grows the rear cavity.
- Click Download. The zip filename contains `BURGER` (text in filename) and the README's `Back cavity depth:` line is present at the new value.

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src/ui/ControlsPanel.tsx src/ui/ExportButtons.tsx src/exporters/manifest.ts \
  tests/unit/exporters/manifest.test.ts
git commit -m "feat: UI control + README + reproduce URL for backCavityDepth

NumberField in the Walls fieldset (step=1, default 20).
Reproduce URL serializes the field.
README parameter dump prints 'Back cavity depth: <v> mm'
(single space between colon and value to preserve the existing
column position for all other labels)."
```

---

## Task 4: CLAUDE.md refresh

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Coordinate system section**

In `CLAUDE.md`, find the `## Coordinate system` section. Replace its first bullet with:

```
- Letters lay flat in the XY plane, extruded along **+Z**. Z=0 is at the lowest face — the open back when `backCavityDepth > 0`, the back panel when `backCavityDepth = 0`. Front face at `Z = totalDepth + backCavityDepth`.
```

- [ ] **Step 2: Add a Back cavity section**

After the `## Connected mode` section and before `## NumberField behaviour`, insert a new section:

```
## Back cavity

`backCavityDepth` (default 20 mm) extends the perimeter wall behind the existing back panel by that amount. The back panel becomes an internal partition: front cavity above (LED + plexi diffusion), rear cavity below (open back, electronics access). Setting `backCavityDepth = 0` collapses the geometry to the original flat-back letter — verifiable by unit test.

The shell mesh's coordinate system shifts so Z=0 is at the open back (lowest face) and Z=`totalDepth + backCavityDepth` is at the front. Slicers print marquee letters open-side-down by default. `buildLetterPlexi`'s Z translation tracks the new top so the plexi mesh stays aligned with the front rabbet.
```

- [ ] **Step 3: Update Spec / plan section**

In `CLAUDE.md`, find the `## Spec / plan` section near the bottom. Add a line for the back-cavity spec:

```
- Back-cavity feature spec: `docs/superpowers/specs/2026-06-10-back-cavity-design.md` (current with code).
```

Place it consistently with the existing spec reference lines.

- [ ] **Step 4: Update test count**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5` and note the test count. In `CLAUDE.md`, find the current test count line in the `## Tests` section and update it to the new count (was 92; should be ~99 with the +7 new tests in Task 1 and the +2 in Task 2).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for back-cavity mode"
```

---

## Self-review

**Spec coverage:**
- New parameter `backCavityDepth` with default 20 → Task 1 ✓
- Geometry change in `buildLetterShell` (extrude `top = totalDepth + backCavityDepth`, conditional rear cavity, restructured subtracts) → Task 2 ✓
- `buildLetterPlexi` Z translation update → Task 2 ✓
- Worker pass-through → Task 2 ✓
- `worker-client.ts` `plainParams` includes the field → Task 2 ✓
- UI `NumberField` in Walls fieldset → Task 3 ✓
- README parameter line (with note about column alignment) → Task 3 ✓
- Reproduce URL serialization → Task 3 ✓
- Validation (≥ 0, finite) → Task 1 ✓
- Persistence migration (default + preserve existing + preserve 0) → Task 1 ✓
- CLAUDE.md updates (coordinate system + Back cavity section + spec ref + test count) → Task 4 ✓
- Unit tests: shell with backCavityDepth=0 and =20; parameters defaults; persistence migrate cases; validate bounds; manifest README → spread across Tasks 1, 2, 3 ✓
- E2E (no assertion changes, just regression check) → Task 3 Step 8 ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code-step has a complete code block. The Task 3 Step 1 explanation about the column alignment includes the exact spacing.

**Type consistency:**
- `backCavityDepth: number` in `Parameters`, `ShellInputs`, `PlexiInputs` — required (no `?`) everywhere from Task 1 onwards. Task 2 makes the geometry types required AT THE SAME TIME as the worker is updated, so no intermediate broken state.
- The `top = totalDepth + backCavityDepth` expression is consistent across `buildLetterShell` and `buildLetterPlexi`.
- `migrate()` adds `backCavityDepth: DEFAULT_PARAMETERS.backCavityDepth` (= 20) consistent with `parameters.ts`'s default.
- `serializable` in `buildReproduceUrl` and `ser` in `initPersistence` both include the new field.
- README label is spelled `Back cavity depth:` consistently in `manifest.ts`, the test, and the spec.

No inconsistencies found.

**Scope check:** This plan covers one feature (rear cavity behind the existing back panel) with one new parameter and one geometry change. Tightly scoped. Foundation for sub-projects B/C/D, which get their own specs and plans later.
