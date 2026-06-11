# Bulb Holes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drill Z-axis through-holes in the back panel along the cavity centerline so users can mount small lightbulbs facing the plexi.

**Architecture:** New pure helper `src/geometry/bulb-holes.ts` computes hole positions by offsetting the cavity inward and walking the resulting ring perimeters. `src/geometry/shell.ts` adds a drilling loop after cable-holes and before mounts. Worker calls the helper per merged component. Four new params in the store; UI section after "Mounting"; README mentions enabled values; defaults disable the feature for backward compatibility.

**Tech Stack:** TypeScript strict, manifold-3d (`CrossSection.offset` + `toPolygons` + `Manifold.cylinder`), Vitest, React + zustand, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-11-bulb-holes-design.md`

---

## File structure

New:
- `src/geometry/bulb-holes.ts` — pure helper `computeBulbHoles(contours, params)`
- `tests/unit/geometry/bulb-holes.test.ts`

Modified:
- `src/state/parameters.ts` — four new fields + defaults
- `src/state/persistence.ts` — fill defaults for old saves
- `src/geometry/validate.ts` — four new validations
- `src/geometry/shell.ts` — `ShellInputs.bulbHoles`; drilling loop
- `src/geometry/worker.ts` — call `computeBulbHoles`, pass to shell, push warnings
- `src/geometry/worker-client.ts` — re-export `BulbHole`, add `bulbhole_inset_collapsed` warning kind, copy new params in `build()`
- `src/ui/ControlsPanel.tsx` — "Bulb holes" fieldset after "Mounting"
- `src/exporters/manifest.ts` — three README lines
- `tests/unit/geometry/shell.test.ts` — through-hole assertion
- `tests/unit/geometry/validate.test.ts` — new field errors
- `tests/unit/state/parameters.test.ts` — defaults round-trip
- `tests/unit/state/persistence.test.ts` — old-payload migration
- `tests/e2e/smoke.spec.ts` — feature-on smoke
- `CLAUDE.md` — new "Bulb holes" section after "Mounting"

---

## Task 1: Add the four parameters with defaults

**Files:**
- Modify: `src/state/parameters.ts`

- [ ] **Step 1: Write the failing test for defaults**

File: `tests/unit/state/parameters.test.ts` — add inside the existing `describe`. (If unsure where, look for an existing test that asserts defaults; mirror its style.)

```ts
it("includes bulb-hole defaults (feature disabled by default)", () => {
  expect(DEFAULT_PARAMETERS.bulbHoleDiameter).toBe(0);
  expect(DEFAULT_PARAMETERS.bulbHoleSpacing).toBe(30);
  expect(DEFAULT_PARAMETERS.bulbHoleInset).toBe(10); // = DEFAULT_WALL_THICKNESS
  expect(DEFAULT_PARAMETERS.bulbHoleMaxCount).toBe(12);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: FAIL — fields don't exist on `Parameters` (TS error) or are `undefined`.

- [ ] **Step 3: Add the fields**

In `src/state/parameters.ts`, extend the `Parameters` type:
```ts
bulbHoleDiameter: number;
bulbHoleSpacing: number;
bulbHoleInset: number;
bulbHoleMaxCount: number;
```

Extend `DEFAULT_PARAMETERS`:
```ts
bulbHoleDiameter: 0,
bulbHoleSpacing: 30,
bulbHoleInset: DEFAULT_WALL_THICKNESS,
bulbHoleMaxCount: 12,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/parameters.ts tests/unit/state/parameters.test.ts
git commit -m "feat(params): add bulb-hole parameters with disabled defaults"
```

---

## Task 2: Persistence migration for old saves

**Files:**
- Modify: `src/state/persistence.ts`
- Test: `tests/unit/state/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/state/persistence.test.ts`:
```ts
it("fills bulb-hole defaults when missing from a legacy save", () => {
  const out = migrate({ wallThickness: 8, letterHeight: 150 });
  expect(out.bulbHoleDiameter).toBe(0);   // disabled
  expect(out.bulbHoleSpacing).toBe(30);
  expect(out.bulbHoleInset).toBe(10);     // = DEFAULT_PARAMETERS.bulbHoleInset
  expect(out.bulbHoleMaxCount).toBe(12);
});

it("preserves explicit bulb-hole values from a save", () => {
  const out = migrate({
    bulbHoleDiameter: 9,
    bulbHoleSpacing: 25,
    bulbHoleInset: 6,
    bulbHoleMaxCount: 8,
  });
  expect(out.bulbHoleDiameter).toBe(9);
  expect(out.bulbHoleSpacing).toBe(25);
  expect(out.bulbHoleInset).toBe(6);
  expect(out.bulbHoleMaxCount).toBe(8);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: FAIL — migrate output is missing the new fields.

- [ ] **Step 3: Extend `migrate()` and the serializer**

In `src/state/persistence.ts`, in `migrate()` (after the existing mount block, before `return out`):
```ts
if (typeof out.bulbHoleDiameter !== "number") {
  out.bulbHoleDiameter = DEFAULT_PARAMETERS.bulbHoleDiameter;
}
if (typeof out.bulbHoleSpacing !== "number") {
  out.bulbHoleSpacing = DEFAULT_PARAMETERS.bulbHoleSpacing;
}
if (typeof out.bulbHoleInset !== "number") {
  out.bulbHoleInset = DEFAULT_PARAMETERS.bulbHoleInset;
}
if (typeof out.bulbHoleMaxCount !== "number") {
  out.bulbHoleMaxCount = DEFAULT_PARAMETERS.bulbHoleMaxCount;
}
```

In the `useParameters.subscribe` callback, extend the `ser` object with:
```ts
bulbHoleDiameter: state.bulbHoleDiameter,
bulbHoleSpacing: state.bulbHoleSpacing,
bulbHoleInset: state.bulbHoleInset,
bulbHoleMaxCount: state.bulbHoleMaxCount,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/persistence.ts tests/unit/state/persistence.test.ts
git commit -m "feat(persistence): migrate bulb-hole defaults for old saves"
```

---

## Task 3: Validation rules

**Files:**
- Modify: `src/geometry/validate.ts`
- Test: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/geometry/validate.test.ts`, add tests modelled on the existing field-error tests. Build a valid base from `DEFAULT_PARAMETERS` and override one field per case:
```ts
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

it("rejects negative bulbHoleDiameter", () => {
  const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleDiameter: -1 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleDiameter")).toBeDefined();
});

it("rejects bulbHoleSpacing <= 0", () => {
  const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleSpacing: 0, bulbHoleDiameter: 8 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleSpacing")).toBeDefined();
});

it("rejects bulbHoleInset <= 0", () => {
  const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleInset: 0, bulbHoleDiameter: 8 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleInset")).toBeDefined();
});

it("rejects non-integer bulbHoleMaxCount", () => {
  const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleMaxCount: 2.5, bulbHoleDiameter: 8 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleMaxCount")).toBeDefined();
});

it("rejects bulbHoleMaxCount < 1", () => {
  const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleMaxCount: 0, bulbHoleDiameter: 8 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleMaxCount")).toBeDefined();
});

it("accepts all bulb-hole defaults", () => {
  const r = validate(DEFAULT_PARAMETERS);
  expect(r.ok).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/geometry/validate.test.ts`
Expected: FAIL — `validate()` doesn't yet check the new fields.

- [ ] **Step 3: Add the validations**

In `src/geometry/validate.ts`, after the mount-block validations, add:
```ts
if (!Number.isFinite(p.bulbHoleDiameter) || p.bulbHoleDiameter < 0) {
  errors.push({ field: "bulbHoleDiameter", message: "Bulb hole diameter must be ≥ 0" });
}
if (!Number.isFinite(p.bulbHoleSpacing) || p.bulbHoleSpacing <= 0) {
  errors.push({ field: "bulbHoleSpacing", message: "Bulb hole spacing must be > 0" });
}
if (!Number.isFinite(p.bulbHoleInset) || p.bulbHoleInset <= 0) {
  errors.push({ field: "bulbHoleInset", message: "Bulb hole inset must be > 0" });
}
if (!Number.isInteger(p.bulbHoleMaxCount) || p.bulbHoleMaxCount < 1) {
  errors.push({ field: "bulbHoleMaxCount", message: "Bulb hole max count must be an integer ≥ 1" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/geometry/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/validate.ts tests/unit/geometry/validate.test.ts
git commit -m "feat(validate): add bulb-hole field validations"
```

---

## Task 4: Pure helper `bulb-holes.ts` — types and disabled-fast-path

**Files:**
- Create: `src/geometry/bulb-holes.ts`
- Create: `tests/unit/geometry/bulb-holes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/geometry/bulb-holes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeBulbHoles } from "../../../src/geometry/bulb-holes";
import type { GlyphContours } from "../../../src/geometry/types";

// 100×200 axis-aligned square in glyph-local coords. CCW outer.
const SQUARE: GlyphContours = [
  [[0, 0], [100, 0], [100, 200], [0, 200]],
];

const baseParams = {
  bulbHoleDiameter: 8,
  bulbHoleSpacing: 30,
  bulbHoleInset: 10,
  bulbHoleMaxCount: 12,
  wallThickness: 5,
};

describe("computeBulbHoles", () => {
  it("returns no holes when diameter is 0 (feature disabled)", async () => {
    const r = await computeBulbHoles(SQUARE, { ...baseParams, bulbHoleDiameter: 0 });
    expect(r.holes).toEqual([]);
    expect(r.warning).toBeUndefined();
  });

  it("returns no holes when contours are empty", async () => {
    const r = await computeBulbHoles([], baseParams);
    expect(r.holes).toEqual([]);
    expect(r.warning).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the skeleton**

Create `src/geometry/bulb-holes.ts`:
```ts
import { getManifold } from "./manifold-init";
import type { GlyphContours } from "./types";

export type BulbHole = { x: number; y: number; diameter: number };

export type BulbHoleParams = {
  bulbHoleDiameter: number;
  bulbHoleSpacing: number;
  bulbHoleInset: number;
  bulbHoleMaxCount: number;
  wallThickness: number;
};

export type BulbHoleWarning = "bulbhole_inset_collapsed";

export type BulbHoleResult = { holes: BulbHole[]; warning?: BulbHoleWarning };

export async function computeBulbHoles(
  contours: GlyphContours,
  params: BulbHoleParams,
): Promise<BulbHoleResult> {
  if (params.bulbHoleDiameter <= 0) return { holes: [] };
  if (contours.length === 0) return { holes: [] };

  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(contours, "NonZero");
  const cavity = outer.offset(-params.wallThickness, "Round");
  const centerline = cavity.offset(-params.bulbHoleInset, "Round");

  if (centerline.isEmpty()) {
    outer.delete();
    cavity.delete();
    centerline.delete();
    return { holes: [], warning: "bulbhole_inset_collapsed" };
  }

  // Step 5: ring walk goes here in the next task. Return [] for now so the
  // disabled/empty/collapsed contracts are testable on their own.
  outer.delete();
  cavity.delete();
  centerline.delete();
  return { holes: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/bulb-holes.ts tests/unit/geometry/bulb-holes.test.ts
git commit -m "feat(geometry): bulb-holes helper skeleton — disabled and empty fast paths"
```

---

## Task 5: Inset-collapse warning

**Files:**
- Modify: `tests/unit/geometry/bulb-holes.test.ts`
- (no source change — covered by skeleton)

- [ ] **Step 1: Write the failing test**

Append to the `describe` in `tests/unit/geometry/bulb-holes.test.ts`:
```ts
it("warns when the inset collapses the centerline (square too thin)", async () => {
  // 100×200 square; wall=5 → cavity 90×190; inset=200 (way more than 95) → empty.
  const r = await computeBulbHoles(SQUARE, { ...baseParams, bulbHoleInset: 200 });
  expect(r.holes).toEqual([]);
  expect(r.warning).toBe("bulbhole_inset_collapsed");
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: PASS — the skeleton already returns the warning.

(Sanity step — this confirms the skeleton's collapse handling is reachable. If it FAILS, the offset behaviour differs from the assumption and the helper needs a tighter inset trigger.)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/geometry/bulb-holes.test.ts
git commit -m "test(geometry): assert bulb-holes inset-collapse warning"
```

---

## Task 6: Ring walk — single ring, even spacing

**Files:**
- Modify: `src/geometry/bulb-holes.ts`
- Modify: `tests/unit/geometry/bulb-holes.test.ts`

- [ ] **Step 1: Write the failing test**

Append:
```ts
it("places holes evenly along a single-ring cavity", async () => {
  // 100×200 square; wall=5 → cavity 90×190; inset=10 → centerline 70×170.
  // Centerline perimeter = 2*(70+170) = 480 mm.
  // bulbHoleSpacing=30 → desiredCount = round(480/30) = 16.
  // bulbHoleMaxCount=12 → cap of 12 (single ring).
  // holesForRing = min(16, 12) = 12.
  // Step = 480/12 = 40 mm.
  const r = await computeBulbHoles(SQUARE, baseParams);
  expect(r.warning).toBeUndefined();
  expect(r.holes).toHaveLength(12);
  // All holes carry the configured diameter.
  for (const h of r.holes) expect(h.diameter).toBe(8);
  // Holes lie inside the centerline rectangle (with a small tolerance for the
  // round offset's curve approximation).
  for (const h of r.holes) {
    expect(h.x).toBeGreaterThanOrEqual(15 - 1);
    expect(h.x).toBeLessThanOrEqual(85 + 1);
    expect(h.y).toBeGreaterThanOrEqual(15 - 1);
    expect(h.y).toBeLessThanOrEqual(185 + 1);
  }
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: FAIL — helper still returns `[]` after collapse check.

- [ ] **Step 3: Implement the ring walk**

In `src/geometry/bulb-holes.ts`, replace the post-collapse-check body (the section between `if (centerline.isEmpty()) { ... }` and the final `return`; keep the disabled/empty/collapsed fast paths intact) with:
```ts
const polygons = centerline.toPolygons();
outer.delete();
cavity.delete();
centerline.delete();

type Ring = { points: ReadonlyArray<[number, number]>; perimeter: number };
const rings: Ring[] = polygons.map((poly) => {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return {
    points: poly.map(([x, y]) => [x, y] as [number, number]),
    perimeter: p,
  };
});

const totalPerimeter = rings.reduce((s, r) => s + r.perimeter, 0);
if (totalPerimeter === 0) return { holes: [] };

const holes: BulbHole[] = [];
const dia = params.bulbHoleDiameter;

for (const ring of rings) {
  const desiredCount = Math.max(1, Math.round(ring.perimeter / params.bulbHoleSpacing));
  const capShare = Math.max(
    1,
    Math.round((params.bulbHoleMaxCount * ring.perimeter) / totalPerimeter),
  );
  const holesForRing = Math.min(desiredCount, capShare);

  if (holesForRing === 1 && ring.perimeter < params.bulbHoleSpacing) {
    let cx = 0, cy = 0;
    for (const [x, y] of ring.points) { cx += x; cy += y; }
    cx /= ring.points.length;
    cy /= ring.points.length;
    holes.push({ x: cx, y: cy, diameter: dia });
    continue;
  }

  const step = ring.perimeter / holesForRing;
  let traveled = 0;
  let nextEmit = 0;
  let emitted = 0;
  for (let i = 0; i < ring.points.length && emitted < holesForRing; i++) {
    const [x1, y1] = ring.points[i];
    const [x2, y2] = ring.points[(i + 1) % ring.points.length];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const segEnd = traveled + segLen;
    while (nextEmit < segEnd && emitted < holesForRing) {
      const t = (nextEmit - traveled) / segLen;
      holes.push({
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
        diameter: dia,
      });
      nextEmit += step;
      emitted += 1;
    }
    traveled = segEnd;
  }
}
return { holes };
```

Delete Step 3's draft snippet entirely; only this clean version remains.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/bulb-holes.ts tests/unit/geometry/bulb-holes.test.ts
git commit -m "feat(geometry): bulb-holes ring walk with cap+spacing distribution"
```

---

## Task 7: Two-ring distribution (cap proportional to perimeter)

**Files:**
- Modify: `tests/unit/geometry/bulb-holes.test.ts`
- (no source change — covered by Task 6)

- [ ] **Step 1: Write the failing test**

Append:
```ts
// Annulus: outer 100×200 square, inner 60×140 hole. Both CCW outer / CW inner
// is what manifold expects in NonZero mode; supply outer CCW + hole CW.
const ANNULUS: GlyphContours = [
  [[0, 0], [100, 0], [100, 200], [0, 200]],            // outer CCW
  [[20, 30], [20, 170], [80, 170], [80, 30]],          // hole CW
];

it("distributes holes between outer + inner rings proportionally", async () => {
  // wall=5 → cavity outer 90×190, hole 70×150.
  // inset=10 → centerline outer 70×170 (per=480), centerline hole 50×130 (per=360).
  // total per=840; cap=12. Outer cap-share = round(12*480/840)=7,
  // inner cap-share = round(12*360/840)=5.
  // spacing=30: outer desired=round(480/30)=16 (capped to 7), inner desired=round(360/30)=12 (capped to 5).
  // Total holes = 7+5 = 12.
  const r = await computeBulbHoles(ANNULUS, baseParams);
  expect(r.warning).toBeUndefined();
  expect(r.holes).toHaveLength(12);
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/unit/geometry/bulb-holes.test.ts`
Expected: PASS — the implementation already handles multiple rings.

If the count differs by ±1 due to manifold's `Round` offset producing extra vertices on the corners (it does — the rounded offset turns each corner into many short segments, shifting perimeter slightly), assert a window: `expect(r.holes.length).toBeGreaterThanOrEqual(11); expect(r.holes.length).toBeLessThanOrEqual(13);`. Make this adjustment ONLY if the strict equality fails.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/geometry/bulb-holes.test.ts
git commit -m "test(geometry): bulb-holes distributes between outer + inner rings"
```

---

## Task 8: Wire `bulbHoles` into `buildLetterShell`

**Files:**
- Modify: `src/geometry/shell.ts`
- Modify: `tests/unit/geometry/shell.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/geometry/shell.test.ts` inside the existing `describe("buildLetterShell", ...)`:
```ts
import type { BulbHole } from "../../../src/geometry/bulb-holes";

it("subtracts a bulb hole from the back panel of a flat-back letter", async () => {
  const noHoles = await buildLetterShell({ ...baseInputs, contours: contoursFor("M") });
  const withHole = await buildLetterShell({
    ...baseInputs,
    contours: contoursFor("M"),
    // Place hole near the centre of the M's bbox; flat-back so back panel = z[0,2].
    bulbHoles: [{ x: 35, y: 50, diameter: 6 } satisfies BulbHole],
  });
  expect(noHoles.ok).toBe(true);
  expect(withHole.ok).toBe(true);
  if (noHoles.ok && withHole.ok) {
    // A single through-hole adds vertices to the mesh; the count must increase.
    expect(withHole.mesh.vertProperties.length).toBeGreaterThan(noHoles.mesh.vertProperties.length);
  }
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/geometry/shell.test.ts`
Expected: FAIL — `ShellInputs` doesn't yet include `bulbHoles`; TS compile error (or, if the field is silently dropped, equal vertex counts).

- [ ] **Step 3: Extend `ShellInputs` and add the drilling loop**

In `src/geometry/shell.ts`:

1. Add the import at the top:
   ```ts
   import type { BulbHole } from "./bulb-holes";
   ```
2. Add to `ShellInputs`:
   ```ts
   bulbHoles?: ReadonlyArray<BulbHole>;
   ```
3. After the cable-hole loop (the block guarded by `if (input.cableHoles && ...`) and BEFORE the mounts block (the block guarded by `if (input.mounts && ...`), insert:
   ```ts
   if (input.bulbHoles && input.bulbHoles.length > 0) {
     const { Manifold } = m;
     const eps = 0.01;
     const length = input.backThickness + 2 * eps;
     const centerZ = input.backCavityDepth + input.backThickness / 2;
     for (const hole of input.bulbHoles) {
       if (hole.diameter <= 0) continue;
       const cyl = Manifold.cylinder(length, hole.diameter / 2, hole.diameter / 2, undefined, true);
       const positioned = cyl.translate([hole.x, hole.y, centerZ]);
       const newShell = shell.subtract(positioned);
       cyl.delete();
       positioned.delete();
       shell.delete();
       shell = newShell;
     }
   }
   ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/geometry/shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/shell.ts tests/unit/geometry/shell.test.ts
git commit -m "feat(shell): drill bulb holes through back panel between cable + mount blocks"
```

---

## Task 9: Worker integration — call helper, pass to shell, surface warnings

**Files:**
- Modify: `src/geometry/worker.ts`
- Modify: `src/geometry/worker-client.ts`

- [ ] **Step 1: Extend the warning union and re-export the type**

In `src/geometry/worker-client.ts`:

1. Add the re-export of the bulb-hole type:
   ```ts
   export type { BulbHole } from "./bulb-holes";
   ```
2. Extend `MergeWarning` to a discriminated union covering bulb-hole warnings (the existing kind only has `bridge_disconnected`). Replace:
   ```ts
   export type MergeWarning = {
     kind: "bridge_disconnected";
     pair: [ComponentMember, ComponentMember];
   };
   ```
   with:
   ```ts
   export type MergeWarning =
     | { kind: "bridge_disconnected"; pair: [ComponentMember, ComponentMember] }
     | { kind: "bulbhole_inset_collapsed"; members: ComponentMember[] };
   ```
3. In `build()`, copy the four new params into `plainParams`:
   ```ts
   bulbHoleDiameter: params.bulbHoleDiameter,
   bulbHoleSpacing: params.bulbHoleSpacing,
   bulbHoleInset: params.bulbHoleInset,
   bulbHoleMaxCount: params.bulbHoleMaxCount,
   ```

- [ ] **Step 2: Wire the helper into the worker**

In `src/geometry/worker.ts`:

1. Add the import:
   ```ts
   import { computeBulbHoles } from "./bulb-holes";
   ```
2. Inside the per-component loop (after `componentMounts` is computed, before the `buildLetterShell` call), add:
   ```ts
   const bulbResult = await computeBulbHoles(comp.mergedContours, {
     bulbHoleDiameter: req.params.bulbHoleDiameter,
     bulbHoleSpacing: req.params.bulbHoleSpacing,
     bulbHoleInset: req.params.bulbHoleInset,
     bulbHoleMaxCount: req.params.bulbHoleMaxCount,
     wallThickness: req.params.wallThickness,
   });
   if (bulbResult.warning === "bulbhole_inset_collapsed") {
     warnings.push({ kind: "bulbhole_inset_collapsed", members: memberRefs });
   }
   ```
3. In the `buildLetterShell` call, add the new field:
   ```ts
   bulbHoles: bulbResult.holes,
   ```

- [ ] **Step 3: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS (existing tests remain green; no new test in this task — the integration is exercised by the e2e in Task 12).

- [ ] **Step 4: Run the type check**

Run: `npx tsc --noEmit`
Expected: PASS — `MergeWarning` extension may break narrowing in any code that exhaustively switches on `kind`. If so, `grep -rn "kind:" src` and add the bulb-hole arm. Likely sites: any `switch (w.kind)` block in `src/ui`. (At time of writing the only `kind` user is the new code, but verify.)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/worker.ts src/geometry/worker-client.ts
git commit -m "feat(worker): compute bulb holes per component, surface inset-collapsed warning"
```

---

## Task 10: UI — controls panel section

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Add the fieldset**

In `src/ui/ControlsPanel.tsx`, immediately after the closing `</fieldset>` of the "Mounting" section (the one whose `<legend>` is `Mounting` and ends with the Mount slot X inset NumberField), insert:
```tsx
<fieldset>
  <legend>Bulb holes</legend>
  <NumberField
    label="Bulb hole diameter"
    unit="mm"
    value={params.bulbHoleDiameter}
    onChange={(v) => params.set({ bulbHoleDiameter: v })}
    error={errorFor(errs, "bulbHoleDiameter")}
    step={0.5}
  />
  <NumberField
    label="Bulb hole spacing"
    unit="mm"
    value={params.bulbHoleSpacing}
    onChange={(v) => params.set({ bulbHoleSpacing: v })}
    error={errorFor(errs, "bulbHoleSpacing")}
    step={1}
  />
  <NumberField
    label="Bulb hole inset"
    unit="mm"
    value={params.bulbHoleInset}
    onChange={(v) => params.set({ bulbHoleInset: v })}
    error={errorFor(errs, "bulbHoleInset")}
    step={1}
  />
  <NumberField
    label="Bulb hole max per letter"
    value={params.bulbHoleMaxCount}
    onChange={(v) => params.set({ bulbHoleMaxCount: v })}
    error={errorFor(errs, "bulbHoleMaxCount")}
    step={1}
  />
</fieldset>
```

(`unit` is omitted on the max-count field because the field is a count, not millimetres. If `NumberField` REQUIRES a `unit` prop, look at the existing usage and pass an empty string or whatever the prop type allows; do not invent a new prop.)

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS. If TypeScript complains about the `NumberField` prop shape, adjust the call to match the existing API (look at how `letterOverlap` or `mountSlotXInset` are wired — they have similar constraints).

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ControlsPanel.tsx
git commit -m "feat(ui): bulb holes controls fieldset"
```

---

## Task 11: README export

**Files:**
- Modify: `src/exporters/manifest.ts`

- [ ] **Step 1: Extend the README**

In `src/exporters/manifest.ts`, in the `lines` array, immediately after the existing `Mount slot inset:` line, add:
```ts
`  Bulb hole dia:     ${params.bulbHoleDiameter} mm`,
`  Bulb hole spacing: ${params.bulbHoleSpacing} mm`,
`  Bulb hole inset:   ${params.bulbHoleInset} mm`,
`  Bulb hole max:     ${params.bulbHoleMaxCount}`,
```

- [ ] **Step 2: Run any README/manifest tests**

Run: `npx vitest run tests/unit/exporters`
Expected: PASS. If a snapshot test on `buildReadme` exists and trips on the new lines, update the snapshot intentionally (`-u` flag) and commit the snapshot diff alongside.

- [ ] **Step 3: Commit**

```bash
git add src/exporters/manifest.ts tests/unit/exporters
git commit -m "feat(export): list bulb-hole settings in README"
```

(If there were no test changes, just commit `manifest.ts`.)

---

## Task 12: E2E smoke — feature on

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Inspect the existing test to find the param-set step**

Run: `grep -n "cableHoleDiameter\|set\b" tests/e2e/smoke.spec.ts | head`
This confirms how the test currently sets parameters (likely via a Zustand store hack or the URL `?p=…` payload).

- [ ] **Step 2: Add bulb-hole values to the test's params**

Wherever `smoke.spec.ts` constructs the parameter set used to drive the build, add:
```ts
bulbHoleDiameter: 8,
bulbHoleSpacing: 30,
bulbHoleInset: 10,
bulbHoleMaxCount: 8,
```

If the test relies on store defaults rather than overrides, add a `set({ ... })` step before the export click that flips on the feature with the values above. The test should still assert the existing zip layout — the exporter doesn't change shape, the worker just doesn't crash.

- [ ] **Step 3: Run the e2e**

Run: `npm run e2e`
Expected: PASS. (First run may need `npx playwright install chromium` if you haven't already.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "test(e2e): smoke covers bulb-hole feature on"
```

---

## Task 13: Documentation — `CLAUDE.md` section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the section**

In `CLAUDE.md`, after the existing `## Mounting` section and before `## `NumberField` behaviour`, add:

```markdown
## Bulb holes

`bulbHoleDiameter`, `bulbHoleSpacing`, `bulbHoleInset`, `bulbHoleMaxCount` (in `state/parameters.ts`) drive the back-panel bulb-hole drilling step. Default `bulbHoleDiameter = 0` disables the feature; geometry is unchanged.

`src/geometry/bulb-holes.ts` is a pure helper: given the merged component contours and params, it returns `{ holes, warning? }`. The centerline is `outer.offset(-wallThickness).offset(-bulbHoleInset)` — i.e. the cavity offset further inward by `bulbHoleInset` so the resulting rings sit roughly along the medial axis of each stroke. Each ring contributes `min(round(perimeter/spacing), capShare)` holes, where `capShare = round(maxCount * ringPerimeter / totalPerimeter)`. Rings shorter than `bulbHoleSpacing` get a single hole at the ring centroid.

`shell.ts` drills each hole as a Z-axis cylinder of length `backThickness + 2·ε`, centred at `Z = backCavityDepth + backThickness/2` so it always pierces the back panel — same code path for flat-back and open-back. The drilling loop runs AFTER cable-holes and BEFORE mounts, so the order is: cavity → cable holes → bulb holes → mount tabs → mount keyholes. A bulb hole that lands inside the keyhole footprint just means the keyhole's subtraction has nothing extra to remove there.

The `centerline.isEmpty()` collapse case (inset too large for the cavity) emits a `bulbhole_inset_collapsed` warning per component. Surfaced via the same `MergeWarning` channel as `bridge_disconnected`.

The cap distribution is intentionally proportional, not equal across rings — a small inner counter (e.g. A's triangle) doesn't deserve as many bulbs as the outer stroke perimeter.
```

- [ ] **Step 2: Add this plan to the spec list**

In the same file, in the `## Spec / plan` section, add a line:
```
- Bulb-holes feature spec: `docs/superpowers/specs/2026-06-11-bulb-holes-design.md` (current with code).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document bulb-holes feature"
```

---

## Task 14: Final verification

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all unit tests green.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS — no errors.

- [ ] **Step 3: Run the e2e**

Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 4: Smoke-test the dev server**

Run: `npm run dev` and open `http://localhost:5173` in a browser. With default params (`bulbHoleDiameter = 0`), the preview should look identical to before. Set `bulbHoleDiameter = 8` and `bulbHoleSpacing = 25`; the preview should show evenly-spaced through-holes in the back panel of each letter. Toggle to flat-back (`backCavityDepth = 0`) and confirm holes still appear through the back face.

Stop the dev server (Ctrl-C). No commit — this is interactive verification only.

- [ ] **Step 5: Final commit if `package-lock.json` changed**

Run: `git status`
If `package-lock.json` or any other unexpected file is dirty, investigate before committing. Otherwise the working tree should be clean.

---

## Plan complete and saved to `docs/superpowers/plans/2026-06-11-bulb-holes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
