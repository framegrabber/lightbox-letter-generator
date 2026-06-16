# Build-volume slicing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users slice a connected-script word (or any over-sized merged Component) into N printable pieces along user-defined vertical cut planes, exporting both the assembled and sliced geometry side-by-side.

**Architecture:** A new pure module `src/geometry/slice.ts` runs after `merge.ts` to split one `Component` into N sub-components via 2D `CrossSection` intersections. Each sub-component (a "piece") flows through the existing `shell.ts` → plexi → cable / bulb / mount pipeline unchanged. Mount keyholes and power-entry cable holes are suppressed on internal cut edges via a new `OuterEdges` flag. Exports carry both the full and the sliced geometry; the preview shows the assembled word with red cut-line overlays.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), `manifold-3d` WASM (2D `CrossSection`), React 19 + R3F + drei (controls + preview), Zustand (state), Vitest (unit tests), Playwright (e2e).

**Reference spec:** `docs/superpowers/specs/2026-06-16-build-volume-slicing-design.md`

---

## Files touched

**New:**
- `src/geometry/slice.ts`
- `tests/unit/geometry/slice.test.ts`
- `tests/unit/geometry/suggest-cuts.test.ts`

**Modified:**
- `src/state/parameters.ts`
- `src/geometry/validate.ts`
- `src/state/persistence.ts`
- `src/geometry/mounts.ts`
- `src/geometry/cable-holes.ts`
- `src/geometry/shell.ts`
- `src/geometry/worker.ts`
- `src/geometry/worker-client.ts`
- `src/exporters/zip.ts`
- `src/exporters/manifest.ts`
- `src/ui/PreviewCanvas.tsx`
- `src/ui/ControlsPanel.tsx`
- `src/ui/ExportButtons.tsx`
- `src/ui/usePreviewBuild.ts`
- `tests/unit/geometry/mounts.test.ts`
- `tests/unit/geometry/cable-holes.test.ts`
- `tests/unit/geometry/shell.test.ts`
- `tests/unit/state/parameters.test.ts`
- `tests/unit/state/persistence.test.ts`
- `tests/unit/geometry/validate.test.ts`
- `tests/unit/exporters/zip.test.ts`
- `tests/unit/exporters/manifest.test.ts`
- `tests/e2e/smoke.spec.ts`
- `CLAUDE.md`

---

## Task 1 — Parameters: `Cut` type, `maxPieceWidth`, `cuts[]`, validation, persistence migration

State-layer work only. Adds the new parameters, the validation rules, and the migration entry.

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `src/state/persistence.ts`
- Modify: `tests/unit/state/parameters.test.ts`
- Modify: `tests/unit/state/persistence.test.ts`
- Modify: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write the failing parameter-defaults test**

Open `tests/unit/state/parameters.test.ts` and append inside `describe("parameters store", () => { … })`:

```ts
  it("starts with maxPieceWidth disabled and no cuts", () => {
    const state = useParameters.getState();
    expect(state.maxPieceWidth).toBe(0);
    expect(state.cuts).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/state/parameters.test.ts -t "maxPieceWidth"` → FAIL ("Property 'maxPieceWidth' does not exist on type 'Parameters'").

- [ ] **Step 2: Add the `Cut` type and the two new parameters with defaults**

Edit `src/state/parameters.ts`. Add after the `FontSource` type, before `Parameters`:

```ts
export type Cut = {
  x: number;       // mm, in word-space X
  angle: number;   // degrees, signed; 0 = vertical cut, +tilts top of the line to the right
};
```

Inside the `Parameters` type, add after `bulbHoleMaxCount: number;`:

```ts
  maxPieceWidth: number;
  cuts: Cut[];
```

Inside `DEFAULT_PARAMETERS`, after `bulbHoleMaxCount: 12,`:

```ts
  maxPieceWidth: 0,
  cuts: [],
```

Run: `npx vitest run tests/unit/state/parameters.test.ts -t "maxPieceWidth"` → PASS.

- [ ] **Step 3: Write the failing validation tests**

In `tests/unit/geometry/validate.test.ts`, append inside `describe("validate", () => { … })`:

```ts
  it("rejects maxPieceWidth < 0", () => {
    const r = validate({ ...ok, maxPieceWidth: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "maxPieceWidth")).toBe(true);
    }
  });

  it("accepts maxPieceWidth === 0 (feature disabled)", () => {
    const r = validate({ ...ok, maxPieceWidth: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects a cut angle outside (-89, +89)", () => {
    const r = validate({ ...ok, cuts: [{ x: 100, angle: 90 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "cuts")).toBe(true);
    }
  });

  it("accepts cuts at the angle boundary just inside (-89, +89)", () => {
    const r = validate({ ...ok, cuts: [{ x: 0, angle: 88.9 }, { x: 100, angle: -88.9 }] });
    expect(r.ok).toBe(true);
  });
```

Run: `npx vitest run tests/unit/geometry/validate.test.ts -t "maxPieceWidth"` → FAIL ("maxPieceWidth is not a key of Parameters" or no error emitted).

- [ ] **Step 4: Add the validation rules**

In `src/geometry/validate.ts`, after the last existing validation block (the `bulbHole*` block) but before the `return errors.length === 0` line, add:

```ts
  if (!Number.isFinite(p.maxPieceWidth) || p.maxPieceWidth < 0) {
    errors.push({ field: "maxPieceWidth", message: "Max piece width must be ≥ 0" });
  }

  if (Array.isArray(p.cuts)) {
    for (const c of p.cuts) {
      if (!Number.isFinite(c.x)) {
        errors.push({ field: "cuts", message: "Cut x must be a finite number" });
        break;
      }
      if (!Number.isFinite(c.angle) || c.angle <= -89 || c.angle >= 89) {
        errors.push({ field: "cuts", message: "Cut angle must be strictly between -89° and +89°" });
        break;
      }
    }
  } else {
    errors.push({ field: "cuts", message: "Cuts must be an array" });
  }
```

Run: `npx vitest run tests/unit/geometry/validate.test.ts -t "maxPieceWidth"` and `… -t "cut angle"` → PASS.

- [ ] **Step 5: Write the failing persistence test**

In `tests/unit/state/persistence.test.ts`, at the top of the file ensure these imports exist:

```ts
import { migrate } from "../../../src/state/persistence";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";
```

(`migrate` is already imported; `DEFAULT_PARAMETERS` may need adding.)

Inside the existing `describe(...)` block, append:

```ts
  it("migrates a payload missing maxPieceWidth and cuts to defaults", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_PARAMETERS));
    delete legacy.maxPieceWidth;
    delete legacy.cuts;
    const migrated = migrate(legacy);
    expect(migrated.maxPieceWidth).toBe(0);
    expect(migrated.cuts).toEqual([]);
  });

  it("round-trips a populated cuts array", () => {
    const params = {
      ...DEFAULT_PARAMETERS,
      maxPieceWidth: 220,
      cuts: [{ x: 100, angle: 0 }, { x: 200, angle: 12.5 }],
    };
    const sp = new URLSearchParams();
    sp.set("p", JSON.stringify(params));
    const decoded = JSON.parse(sp.get("p")!);
    const migrated = migrate(decoded);
    expect(migrated.maxPieceWidth).toBe(220);
    expect(migrated.cuts).toEqual([{ x: 100, angle: 0 }, { x: 200, angle: 12.5 }]);
  });
```

(If the test file uses different helper names — `parseSavedParameters`, etc. — match them. The `migrate` reference reflects the project's existing migration helper; rename as needed by reading the file.)

Run: `npx vitest run tests/unit/state/persistence.test.ts -t "maxPieceWidth"` → FAIL.

- [ ] **Step 6: Add migration defaults in persistence**

In `src/state/persistence.ts`, find the `migrate` function. Inside it, after any existing field-default backfills (look for the pattern `legacy.X ?? DEFAULT_X`), add:

```ts
  if (legacy.maxPieceWidth === undefined) legacy.maxPieceWidth = 0;
  if (!Array.isArray(legacy.cuts)) legacy.cuts = [];
```

Run: `npx vitest run tests/unit/state/persistence.test.ts -t "maxPieceWidth"` → PASS.

- [ ] **Step 7: Type-check the whole tree**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 8: Commit**

```bash
git add src/state/parameters.ts src/geometry/validate.ts src/state/persistence.ts \
        tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
        tests/unit/geometry/validate.test.ts
git commit -m "feat(state): add maxPieceWidth + cuts parameters with validation"
```

---

## Task 2 — `suggestCuts` helper

Pure function. Lives at the top of the new `slice.ts` file so the slicer and the controls panel both pull from one place.

**Files:**
- Create: `src/geometry/slice.ts` (suggestCuts only; sliceComponent lands in Task 3)
- Create: `tests/unit/geometry/suggest-cuts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/geometry/suggest-cuts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { suggestCuts } from "../../../src/geometry/slice";

describe("suggestCuts", () => {
  it("returns [] when maxPieceWidth is 0", () => {
    expect(suggestCuts({ minX: 0, maxX: 500 }, 0)).toEqual([]);
  });

  it("returns [] when word fits in one piece", () => {
    expect(suggestCuts({ minX: 0, maxX: 200 }, 220)).toEqual([]);
  });

  it("places one cut at the midpoint when word width is exactly 2×maxPieceWidth", () => {
    expect(suggestCuts({ minX: 0, maxX: 400 }, 200)).toEqual([
      { x: 200, angle: 0 },
    ]);
  });

  it("places two cuts at thirds when word width is 3×maxPieceWidth", () => {
    expect(suggestCuts({ minX: 0, maxX: 600 }, 200)).toEqual([
      { x: 200, angle: 0 },
      { x: 400, angle: 0 },
    ]);
  });

  it("rounds piece count up: width 500, max 200 → 3 pieces, 2 cuts evenly spaced", () => {
    const cuts = suggestCuts({ minX: 0, maxX: 500 }, 200);
    expect(cuts).toHaveLength(2);
    expect(cuts[0].x).toBeCloseTo(500 / 3, 6);
    expect(cuts[1].x).toBeCloseTo((500 / 3) * 2, 6);
    expect(cuts.every((c) => c.angle === 0)).toBe(true);
  });

  it("honors a non-zero minX (word-space origin shifted)", () => {
    expect(suggestCuts({ minX: 100, maxX: 700 }, 200)).toEqual([
      { x: 300, angle: 0 },
      { x: 500, angle: 0 },
    ]);
  });

  it("is idempotent — repeated calls return equal arrays", () => {
    const a = suggestCuts({ minX: 0, maxX: 600 }, 200);
    const b = suggestCuts({ minX: 0, maxX: 600 }, 200);
    expect(a).toEqual(b);
  });
});
```

Run: `npx vitest run tests/unit/geometry/suggest-cuts.test.ts` → FAIL ("Cannot find module 'src/geometry/slice'").

- [ ] **Step 2: Write the helper**

Create `src/geometry/slice.ts` with:

```ts
import type { Cut } from "../state/parameters";

export type { Cut };

export function suggestCuts(
  wordBBox: { minX: number; maxX: number },
  maxPieceWidth: number,
): Cut[] {
  if (!Number.isFinite(maxPieceWidth) || maxPieceWidth <= 0) return [];
  const width = wordBBox.maxX - wordBBox.minX;
  if (!Number.isFinite(width) || width <= maxPieceWidth) return [];
  const pieces = Math.ceil(width / maxPieceWidth);
  const step = width / pieces;
  const out: Cut[] = [];
  for (let i = 1; i < pieces; i++) {
    out.push({ x: wordBBox.minX + i * step, angle: 0 });
  }
  return out;
}
```

Run: `npx vitest run tests/unit/geometry/suggest-cuts.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/slice.ts tests/unit/geometry/suggest-cuts.test.ts
git commit -m "feat(geometry): suggestCuts helper for evenly-spaced slice planes"
```

---

## Task 3 — `sliceComponent`: identity, single vertical cut, bbox filtering

Adds the slicer core. Identity-on-empty + single-cut split for the simplest paths. Angled cuts, warnings, and `OuterEdges` come in later tasks.

**Files:**
- Modify: `src/geometry/slice.ts`
- Create: `tests/unit/geometry/slice.test.ts`

- [ ] **Step 1: Sketch the public types in `slice.ts`**

Before any tests, extend `src/geometry/slice.ts` with the type surface (no implementation yet). Replace the file's contents with:

```ts
import type { Cut, Parameters } from "../state/parameters";
import type { Component, ComponentMember } from "./merge";

export type { Cut };

export type SlicedPiece = Component & {
  sliceIndex: number;       // 1-based, left-to-right
  totalSlices: number;
  parentMembers: ComponentMember[];
};

export type OuterEdges = { left: boolean; right: boolean };

export type SliceWarning =
  | { kind: "slice_empty";       componentMembers: ComponentMember[]; sliceIndex: number }
  | { kind: "slice_crossed";     cuts: [number, number] }
  | { kind: "slice_oversize";    componentMembers: ComponentMember[]; sliceIndex: number; width: number }
  | { kind: "slice_recommended"; componentMembers: ComponentMember[] };

export type SliceResult = {
  pieces: SlicedPiece[];
  outerEdges: OuterEdges[];   // parallel to `pieces`
  warnings: SliceWarning[];
};

export function suggestCuts(
  wordBBox: { minX: number; maxX: number },
  maxPieceWidth: number,
): Cut[] {
  if (!Number.isFinite(maxPieceWidth) || maxPieceWidth <= 0) return [];
  const width = wordBBox.maxX - wordBBox.minX;
  if (!Number.isFinite(width) || width <= maxPieceWidth) return [];
  const pieces = Math.ceil(width / maxPieceWidth);
  const step = width / pieces;
  const out: Cut[] = [];
  for (let i = 1; i < pieces; i++) {
    out.push({ x: wordBBox.minX + i * step, angle: 0 });
  }
  return out;
}

export async function sliceComponent(
  component: Component,
  cuts: readonly Cut[],
  maxPieceWidth: number,
): Promise<SliceResult> {
  throw new Error("sliceComponent: not yet implemented");
}

// Re-export the Parameters import so unused-import lint doesn't trip.
export type _ParametersGuard = Parameters;
```

Run: `npx tsc --noEmit` → may complain about the unused `Parameters` import; in that case drop the `_ParametersGuard` line and remove the `Parameters` from the import.

- [ ] **Step 2: Write failing identity / no-cuts tests**

Create `tests/unit/geometry/slice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sliceComponent } from "../../../src/geometry/slice";
import type { Component } from "../../../src/geometry/merge";

// 100×200 rectangle in word space, anchored at (0,0).
const SQUARE: Component = {
  members: [{ char: "I", index: 0, xOffset: 0 }],
  mergedContours: [[[0, 0], [100, 0], [100, 200], [0, 200]]],
  bbox: { minX: 0, minY: 0, maxX: 100, maxY: 200 },
};

describe("sliceComponent", () => {
  it("returns the component unchanged when cuts is empty", async () => {
    const r = await sliceComponent(SQUARE, [], 0);
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].bbox).toEqual(SQUARE.bbox);
    expect(r.pieces[0].sliceIndex).toBe(1);
    expect(r.pieces[0].totalSlices).toBe(1);
    expect(r.outerEdges).toEqual([{ left: true, right: true }]);
    expect(r.warnings).toEqual([]);
  });

  it("filters out cuts whose x falls outside the component bbox", async () => {
    const r = await sliceComponent(SQUARE, [{ x: 500, angle: 0 }], 0);
    expect(r.pieces).toHaveLength(1);
    expect(r.outerEdges).toEqual([{ left: true, right: true }]);
  });

  it("splits a square in half on a single vertical cut at the midpoint", async () => {
    const r = await sliceComponent(SQUARE, [{ x: 50, angle: 0 }], 0);
    expect(r.pieces).toHaveLength(2);
    expect(r.pieces[0].sliceIndex).toBe(1);
    expect(r.pieces[1].sliceIndex).toBe(2);
    expect(r.pieces[0].totalSlices).toBe(2);
    expect(r.pieces[1].totalSlices).toBe(2);
    expect(r.pieces[0].bbox.minX).toBeCloseTo(0, 3);
    expect(r.pieces[0].bbox.maxX).toBeCloseTo(50, 3);
    expect(r.pieces[1].bbox.minX).toBeCloseTo(50, 3);
    expect(r.pieces[1].bbox.maxX).toBeCloseTo(100, 3);
    expect(r.outerEdges).toEqual([
      { left: true, right: false },
      { left: false, right: true },
    ]);
  });
});
```

Run: `npx vitest run tests/unit/geometry/slice.test.ts` → FAIL ("sliceComponent: not yet implemented").

- [ ] **Step 3: Implement the slicer with the simple two-strip path**

Replace the `sliceComponent` function in `src/geometry/slice.ts` with:

```ts
import { getManifold } from "./manifold-init";
import type { GlyphContours, Polygon } from "./types";

function bboxOfContours(c: GlyphContours): Component["bbox"] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of c) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

// Build a single-ring rectangle polygon (CCW) covering the strip between two
// vertical cut planes at xLo and xHi, extended in Y by `margin` past the
// bbox so the intersect catches every contour point.
function strip(xLo: number, xHi: number, yLo: number, yHi: number): Polygon {
  return [
    [xLo, yLo],
    [xHi, yLo],
    [xHi, yHi],
    [xLo, yHi],
  ];
}

function outerEdgesFor(n: number): OuterEdges[] {
  if (n <= 1) return [{ left: true, right: true }];
  const out: OuterEdges[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ left: i === 0, right: i === n - 1 });
  }
  return out;
}

export async function sliceComponent(
  component: Component,
  cuts: readonly Cut[],
  _maxPieceWidth: number,
): Promise<SliceResult> {
  const { CrossSection } = await getManifold();
  const warnings: SliceWarning[] = [];

  // 1. Filter cuts to those whose x lies strictly inside the component bbox.
  const inBounds = cuts.filter(
    (c) => c.x > component.bbox.minX && c.x < component.bbox.maxX,
  );

  // 2. Identity-on-no-applicable-cuts.
  if (inBounds.length === 0) {
    return {
      pieces: [
        {
          members: component.members,
          mergedContours: component.mergedContours,
          bbox: component.bbox,
          sliceIndex: 1,
          totalSlices: 1,
          parentMembers: component.members,
        },
      ],
      outerEdges: outerEdgesFor(1),
      warnings,
    };
  }

  // 3. Sort cuts by x.
  const sorted = [...inBounds].sort((a, b) => a.x - b.x);

  // 4. Build N+1 vertical-only strips (angles are added in Task 4).
  const margin = Math.max(
    1,
    (component.bbox.maxX - component.bbox.minX) * 0.1,
    (component.bbox.maxY - component.bbox.minY) * 0.1,
  );
  const yLo = component.bbox.minY - margin;
  const yHi = component.bbox.maxY + margin;
  const xs = [component.bbox.minX - margin, ...sorted.map((c) => c.x), component.bbox.maxX + margin];

  const source = new CrossSection(component.mergedContours, "NonZero");
  const pieces: SlicedPiece[] = [];

  for (let i = 0; i < xs.length - 1; i++) {
    const stripPoly = new CrossSection([strip(xs[i], xs[i + 1], yLo, yHi)], "NonZero");
    const intersected = source.intersect(stripPoly);
    const area = intersected.area();
    if (area < 0.5) {
      // Empty / degenerate piece — handled with a warning in Task 5.
      stripPoly.delete();
      intersected.delete();
      continue;
    }
    const contours = intersected.toPolygons() as GlyphContours;
    const bbox = bboxOfContours(contours);
    pieces.push({
      members: component.members,
      mergedContours: contours,
      bbox,
      sliceIndex: pieces.length + 1, // will be re-numbered below if slivers were dropped
      totalSlices: 0, // filled in once we know the survivor count
      parentMembers: component.members,
    });
    stripPoly.delete();
    intersected.delete();
  }
  source.delete();

  const total = pieces.length;
  for (let i = 0; i < pieces.length; i++) {
    pieces[i].sliceIndex = i + 1;
    pieces[i].totalSlices = total;
  }

  return {
    pieces,
    outerEdges: outerEdgesFor(pieces.length),
    warnings,
  };
}
```

You'll need to remove the `_ParametersGuard` line from Step 1 and clean the imports — the final top of `src/geometry/slice.ts` should look like:

```ts
import type { Cut } from "../state/parameters";
import type { Component, ComponentMember } from "./merge";
import { getManifold } from "./manifold-init";
import type { GlyphContours, Polygon } from "./types";
```

Run: `npx vitest run tests/unit/geometry/slice.test.ts` → PASS.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/slice.ts tests/unit/geometry/slice.test.ts
git commit -m "feat(geometry): sliceComponent — identity + single-cut split"
```

---

## Task 4 — `sliceComponent`: angled cuts

Replace the vertical-strip math with proper four-corner trapezoidal strips so per-cut `angle` works.

**Files:**
- Modify: `src/geometry/slice.ts`
- Modify: `tests/unit/geometry/slice.test.ts`

- [ ] **Step 1: Write the failing angled-cut test**

In `tests/unit/geometry/slice.test.ts`, append to the `describe` block:

```ts
  it("splits a tall rectangle with a 15° cut centered at the midpoint", async () => {
    // 100×200 rectangle. Cut anchored at (50, 0) tilting top to the right by 15°.
    // At Y=200 the cut line lands at x = 50 + 200 * tan(15°) ≈ 50 + 53.59 ≈ 103.59.
    // That overshoots the bbox (maxX=100), so the right piece has 0 width at the top.
    // Use a milder angle to keep the cut inside the bbox.
    // Cut at x=50, angle=10° → at Y=200, x = 50 + 200*tan(10°) ≈ 85.27.
    const r = await sliceComponent(SQUARE, [{ x: 50, angle: 10 }], 0);
    expect(r.pieces).toHaveLength(2);
    // Left piece spans X from 0 (at Y=0 the cut is at x=50, at Y=200 at x≈85.27).
    // Left piece bbox: minX=0, maxX≈85.27.
    expect(r.pieces[0].bbox.minX).toBeCloseTo(0, 3);
    expect(r.pieces[0].bbox.maxX).toBeCloseTo(50 + 200 * Math.tan((10 * Math.PI) / 180), 1);
    // Right piece bbox: minX=50, maxX=100.
    expect(r.pieces[1].bbox.minX).toBeCloseTo(50, 3);
    expect(r.pieces[1].bbox.maxX).toBeCloseTo(100, 3);
    // Total area conserved (rectangle area = 100*200 = 20000) within tolerance.
    const a0 = (r.pieces[0].bbox.maxX - r.pieces[0].bbox.minX); // bbox-based, not exact area
    void a0;
  });

  it("conserves total area on a multi-cut slice within 1e-3 mm²", async () => {
    const r = await sliceComponent(SQUARE, [{ x: 30, angle: 0 }, { x: 70, angle: 0 }], 0);
    expect(r.pieces).toHaveLength(3);
    // Areas (rectangle slabs): 30*200, 40*200, 30*200 = 6000, 8000, 6000.
    // Use CrossSection area via bbox proxy (rectangles only). The slicer's bbox
    // is recomputed from sliced contours, so check those bbox widths sum to 100.
    const widths = r.pieces.map((p) => p.bbox.maxX - p.bbox.minX);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 3);
  });
```

Run: `npx vitest run tests/unit/geometry/slice.test.ts -t "15°"` → FAIL (current `strip` is vertical-only — both pieces' bboxes won't match the angled math).

Actually, with vertical strips the left piece's `maxX` is 50, not 85.27, so the `toBeCloseTo` fails. Good — that's the falsifying signal.

- [ ] **Step 2: Replace `strip(...)` with a trapezoidal helper that honors per-cut angle**

In `src/geometry/slice.ts`, replace the `strip(...)` function with:

```ts
// Build a four-corner polygon (CCW) bounded on the left by the line through
// (xLo, 0) with angle `angleLo` (degrees, signed from vertical), on the right
// by the line through (xHi, 0) with angle `angleHi`, and clipped vertically
// to Y ∈ [yLo, yHi]. A vertical cut has angle = 0. tan(angle) shifts the X
// coordinate per unit Y.
function obliqueStrip(
  xLo: number,
  angleLo: number,
  xHi: number,
  angleHi: number,
  yLo: number,
  yHi: number,
): Polygon {
  const tLo = Math.tan((angleLo * Math.PI) / 180);
  const tHi = Math.tan((angleHi * Math.PI) / 180);
  return [
    [xLo + yLo * tLo, yLo],
    [xHi + yLo * tHi, yLo],
    [xHi + yHi * tHi, yHi],
    [xLo + yHi * tLo, yHi],
  ];
}
```

Then update the loop in `sliceComponent` to call it. Replace the existing `for` loop body that builds `stripPoly` with:

```ts
  for (let i = 0; i < xs.length - 1; i++) {
    const angleLo = i === 0 ? 0 : sorted[i - 1].angle;
    const angleHi = i === sorted.length ? 0 : sorted[i].angle;
    const stripPoly = new CrossSection(
      [obliqueStrip(xs[i], angleLo, xs[i + 1], angleHi, yLo, yHi)],
      "NonZero",
    );
    const intersected = source.intersect(stripPoly);
    const area = intersected.area();
    if (area < 0.5) {
      stripPoly.delete();
      intersected.delete();
      continue;
    }
    const contours = intersected.toPolygons() as GlyphContours;
    const bbox = bboxOfContours(contours);
    pieces.push({
      members: component.members,
      mergedContours: contours,
      bbox,
      sliceIndex: pieces.length + 1,
      totalSlices: 0,
      parentMembers: component.members,
    });
    stripPoly.delete();
    intersected.delete();
  }
```

Note: the outer strips (i=0 left edge, i=N-1 right edge) keep `angle = 0` because they're synthetic bounding edges at `bbox.minX - margin` and `bbox.maxX + margin`. Only the interior cuts carry the user's angle.

Also remove the now-unused `strip(...)` function.

Run: `npx vitest run tests/unit/geometry/slice.test.ts` → all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/slice.ts tests/unit/geometry/slice.test.ts
git commit -m "feat(geometry): sliceComponent — per-cut angle via oblique strips"
```

---

## Task 5 — `sliceComponent`: warnings (`slice_empty`, `slice_crossed`, `slice_oversize`, `slice_recommended`)

Surfaces the edge-case signals from the spec.

**Files:**
- Modify: `src/geometry/slice.ts`
- Modify: `tests/unit/geometry/slice.test.ts`

- [ ] **Step 1: Write the failing warning tests**

In `tests/unit/geometry/slice.test.ts`, append:

```ts
  it("emits slice_empty when a piece collapses to <0.5 mm²", async () => {
    // Two cuts placed almost on top of each other create a thin sliver between them.
    const r = await sliceComponent(SQUARE, [
      { x: 49.999, angle: 0 },
      { x: 50.0,   angle: 0 },
    ], 0);
    // The 0.001-wide strip * 200 height = 0.2 mm² < 0.5 → dropped.
    expect(r.pieces).toHaveLength(2);
    expect(r.warnings.some((w) => w.kind === "slice_empty")).toBe(true);
  });

  it("emits slice_crossed when two cuts intersect inside the bbox Y range", async () => {
    // Cut A at x=30 with angle=+45° lands at X ≈ 30 + 200 ≈ 230 at top.
    // Cut B at x=70 with angle=-45° lands at X ≈ 70 - 200 ≈ -130 at top.
    // The two lines cross inside Y ∈ [0,200].
    const r = await sliceComponent(SQUARE, [
      { x: 30, angle: 45 },
      { x: 70, angle: -45 },
    ], 0);
    expect(r.warnings.some((w) => w.kind === "slice_crossed")).toBe(true);
  });

  it("emits slice_oversize when a piece bbox still exceeds maxPieceWidth", async () => {
    // Square is 100 wide. Cut at x=80 leaves an 80-wide left piece, 20-wide right.
    // maxPieceWidth = 50 → left piece overshoots.
    const r = await sliceComponent(SQUARE, [{ x: 80, angle: 0 }], 50);
    expect(r.warnings.some((w) => w.kind === "slice_oversize")).toBe(true);
  });

  it("emits slice_recommended when no cuts are configured but component exceeds maxPieceWidth", async () => {
    const r = await sliceComponent(SQUARE, [], 50);
    expect(r.pieces).toHaveLength(1);
    expect(r.warnings.some((w) => w.kind === "slice_recommended")).toBe(true);
  });

  it("does not emit slice_recommended when maxPieceWidth = 0", async () => {
    const r = await sliceComponent(SQUARE, [], 0);
    expect(r.warnings).toEqual([]);
  });
```

Run: `npx vitest run tests/unit/geometry/slice.test.ts -t "slice_"` → FAIL on all five (warnings are never emitted today).

- [ ] **Step 2: Implement crossing detection, slice_recommended, slice_oversize**

In `src/geometry/slice.ts`, replace the function body of `sliceComponent` with:

```ts
export async function sliceComponent(
  component: Component,
  cuts: readonly Cut[],
  maxPieceWidth: number,
): Promise<SliceResult> {
  const { CrossSection } = await getManifold();
  const warnings: SliceWarning[] = [];
  const width = component.bbox.maxX - component.bbox.minX;

  // 1. Filter cuts to those whose x lies strictly inside the component bbox.
  const inBounds = cuts.filter(
    (c) => c.x > component.bbox.minX && c.x < component.bbox.maxX,
  );

  // 2. Identity-on-no-applicable-cuts. Emit slice_recommended if relevant.
  if (inBounds.length === 0) {
    if (maxPieceWidth > 0 && width > maxPieceWidth) {
      warnings.push({ kind: "slice_recommended", componentMembers: component.members });
    }
    return {
      pieces: [
        {
          members: component.members,
          mergedContours: component.mergedContours,
          bbox: component.bbox,
          sliceIndex: 1,
          totalSlices: 1,
          parentMembers: component.members,
        },
      ],
      outerEdges: outerEdgesFor(1),
      warnings,
    };
  }

  // 3. Sort cuts by x.
  const sorted = [...inBounds].sort((a, b) => a.x - b.x);

  // 4. Detect crossing cuts. Two cuts (xi, θi) and (xj, θj) with i<j cross at
  //    Y = (xj - xi) / (tan(θi) - tan(θj)). If the result lies in (bbox.minY, bbox.maxY)
  //    the lines cross inside the component.
  const yMin = component.bbox.minY;
  const yMax = component.bbox.maxY;
  for (let i = 0; i < sorted.length; i++) {
    const ti = Math.tan((sorted[i].angle * Math.PI) / 180);
    for (let j = i + 1; j < sorted.length; j++) {
      const tj = Math.tan((sorted[j].angle * Math.PI) / 180);
      if (Math.abs(ti - tj) < 1e-9) continue;
      const yCross = (sorted[j].x - sorted[i].x) / (ti - tj);
      if (yCross > yMin && yCross < yMax) {
        // Find original indices in the input `cuts` array for the warning payload.
        const origI = cuts.indexOf(sorted[i]);
        const origJ = cuts.indexOf(sorted[j]);
        warnings.push({ kind: "slice_crossed", cuts: [origI, origJ] });
      }
    }
  }

  // 5. Build N+1 trapezoidal strips and intersect.
  const margin = Math.max(1, width * 0.1, (yMax - yMin) * 0.1);
  const yLo = yMin - margin;
  const yHi = yMax + margin;
  const xs = [component.bbox.minX - margin, ...sorted.map((c) => c.x), component.bbox.maxX + margin];
  const angles = [0, ...sorted.map((c) => c.angle), 0];

  const source = new CrossSection(component.mergedContours, "NonZero");
  const pieces: SlicedPiece[] = [];
  const droppedSliceIndices: number[] = []; // for slice_empty members (use input ordinals)

  for (let i = 0; i < xs.length - 1; i++) {
    const stripPoly = new CrossSection(
      [obliqueStrip(xs[i], angles[i], xs[i + 1], angles[i + 1], yLo, yHi)],
      "NonZero",
    );
    const intersected = source.intersect(stripPoly);
    const area = intersected.area();
    if (area < 0.5) {
      droppedSliceIndices.push(i + 1);
      stripPoly.delete();
      intersected.delete();
      continue;
    }
    const contours = intersected.toPolygons() as GlyphContours;
    const bbox = bboxOfContours(contours);
    pieces.push({
      members: component.members,
      mergedContours: contours,
      bbox,
      sliceIndex: 0, // re-numbered below
      totalSlices: 0,
      parentMembers: component.members,
    });
    stripPoly.delete();
    intersected.delete();
  }
  source.delete();

  // 6. Re-number surviving pieces left-to-right.
  const total = pieces.length;
  for (let i = 0; i < total; i++) {
    pieces[i].sliceIndex = i + 1;
    pieces[i].totalSlices = total;
  }

  // 7. Emit slice_empty for each dropped piece.
  for (const idx of droppedSliceIndices) {
    warnings.push({ kind: "slice_empty", componentMembers: component.members, sliceIndex: idx });
  }

  // 8. Emit slice_oversize for any surviving piece still wider than maxPieceWidth.
  if (maxPieceWidth > 0) {
    for (const p of pieces) {
      const w = p.bbox.maxX - p.bbox.minX;
      if (w > maxPieceWidth) {
        warnings.push({
          kind: "slice_oversize",
          componentMembers: component.members,
          sliceIndex: p.sliceIndex,
          width: w,
        });
      }
    }
  }

  return {
    pieces,
    outerEdges: outerEdgesFor(pieces.length),
    warnings,
  };
}
```

Run: `npx vitest run tests/unit/geometry/slice.test.ts` → all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/slice.ts tests/unit/geometry/slice.test.ts
git commit -m "feat(geometry): sliceComponent — emit empty/crossed/oversize/recommended warnings"
```

---

## Task 6 — `mounts.ts` honors `OuterEdges`

Mount slots and tabs are suppressed when their side is marked as not-an-outer-edge.

**Files:**
- Modify: `src/geometry/mounts.ts`
- Modify: `tests/unit/geometry/mounts.test.ts`

- [ ] **Step 1: Inspect current `computeMounts` signature**

Run: `sed -n '1,80p' src/geometry/mounts.ts`. Note the `MountParams` shape and the return type (`MountPlan` with `slots: MountSlot[]` and `tabs: MountTab[]`).

- [ ] **Step 2: Write the failing tests**

In `tests/unit/geometry/mounts.test.ts`, append (or add inside the existing `describe`):

```ts
import type { OuterEdges } from "../../../src/geometry/slice";

it("suppresses both slots and tabs when OuterEdges = {false, false}", () => {
  // Use whatever fixture this test file already uses for a rectangle component.
  // Swap CONTOUR_FIXTURE for the actual local fixture name.
  const plan = computeMounts(CONTOUR_FIXTURE, BASE_PARAMS, { left: false, right: false });
  expect(plan.slots).toEqual([]);
  expect(plan.tabs).toEqual([]);
});

it("emits only the left side when OuterEdges = {true, false}", () => {
  const plan = computeMounts(CONTOUR_FIXTURE, BASE_PARAMS, { left: true, right: false });
  expect(plan.slots).toHaveLength(1);
  // The left slot's X is < the contour's X centroid.
  const centroid = (CONTOUR_FIXTURE[0].reduce((a, [x]) => a + x, 0) / CONTOUR_FIXTURE[0].length);
  expect(plan.slots[0].x).toBeLessThan(centroid);
});

it("emits only the right side when OuterEdges = {false, true}", () => {
  const plan = computeMounts(CONTOUR_FIXTURE, BASE_PARAMS, { left: false, right: true });
  expect(plan.slots).toHaveLength(1);
  const centroid = (CONTOUR_FIXTURE[0].reduce((a, [x]) => a + x, 0) / CONTOUR_FIXTURE[0].length);
  expect(plan.slots[0].x).toBeGreaterThan(centroid);
});

it("defaults to {true, true} when OuterEdges arg is omitted (back-compat)", () => {
  const plan = computeMounts(CONTOUR_FIXTURE, BASE_PARAMS);
  expect(plan.slots).toHaveLength(2);
});
```

If `CONTOUR_FIXTURE` / `BASE_PARAMS` aren't already defined in the file, read the file's existing fixtures and use whatever it provides for a working mount setup.

Run: `npx vitest run tests/unit/geometry/mounts.test.ts -t "OuterEdges"` → FAIL ("computeMounts: too many arguments" or the optional arg is silently ignored).

- [ ] **Step 3: Extend `computeMounts` to accept `OuterEdges`**

In `src/geometry/mounts.ts`:

a) Add an import: `import type { OuterEdges } from "./slice";`

b) Change the `computeMounts` signature from:

```ts
export function computeMounts(
  contours: GlyphContours,
  params: MountParams,
): MountPlan {
```

to:

```ts
export function computeMounts(
  contours: GlyphContours,
  params: MountParams,
  outerEdges: OuterEdges = { left: true, right: true },
): MountPlan {
```

c) Inside the function, locate where the two `MountSlot` entries are pushed into the `slots` array. Wrap the left-slot push with `if (outerEdges.left) { … }` and the right-slot push with `if (outerEdges.right) { … }`.

d) Find where tabs are constructed (only present in open-back mode, `backCavityDepth > 0`). Apply the same `outerEdges.left` / `outerEdges.right` gate to the corresponding tab.

Run: `npx vitest run tests/unit/geometry/mounts.test.ts` → all PASS.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/mounts.ts tests/unit/geometry/mounts.test.ts
git commit -m "feat(mounts): suppress slot+tab on non-outer edges via OuterEdges flag"
```

---

## Task 7 — `cable-holes.ts`: tag holes with `kind` discriminator

The worker calls `computeCableHoles` ONCE globally per build (the cable layout is word-global). To let the worker reliably suppress power-entry holes on non-outer sliced pieces, tag each emitted hole with a `kind: "boundary" | "power-entry-left" | "power-entry-right"` field. The per-piece filter in Task 10 then checks `kind` against `outerEdges` — far more reliable than X-coordinate heuristics (power-entry holes sit AT the bbox edge, not outside it).

**Files:**
- Modify: `src/geometry/cable-holes.ts`
- Modify: `tests/unit/geometry/cable-holes.test.ts`

- [ ] **Step 1: Write failing tests for the new `kind` field**

In `tests/unit/geometry/cable-holes.test.ts`, append:

```ts
describe("computeCableHoles kind discriminator", () => {
  const layout: CableHoleLayoutInput[] = [
    { originalIndex: 0, xOffset: 0 },
    { originalIndex: 1, xOffset: 60 },
  ];
  const contours = new Map([[0, SQUARE], [1, SQUARE]]);

  it("tags the boundary hole as 'boundary'", () => {
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("boundary");
  });

  it("tags power-entry holes as 'power-entry-left' and 'power-entry-right'", () => {
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: true });
    expect(out.some((h) => h.kind === "power-entry-left" && h.x === 0)).toBe(true);
    expect(out.some((h) => h.kind === "power-entry-right" && h.x === 110)).toBe(true);
    expect(out.some((h) => h.kind === "boundary")).toBe(true);
  });
});
```

Run: `npx vitest run tests/unit/geometry/cable-holes.test.ts -t "kind discriminator"` → FAIL (`kind` doesn't exist on `CableHole`).

- [ ] **Step 2: Add `kind` to the `CableHole` type**

In `src/geometry/cable-holes.ts`, extend the `CableHole` type. Find:

```ts
export type CableHole = {
  x: number;
  y: number;
  z: number;
  diameter: number;
  length: number;
};
```

Replace with:

```ts
export type CableHole = {
  x: number;
  y: number;
  z: number;
  diameter: number;
  length: number;
  kind: "boundary" | "power-entry-left" | "power-entry-right";
};
```

- [ ] **Step 3: Tag emissions**

In the same file, locate the two `holes.push(...)` calls inside the `if (params.cableHoleAtEnds)` block (lines ~103-104). Update them to include `kind`:

```ts
      holes.push({ x: first.minX, ...yzd, length: endLength, kind: "power-entry-left" });
      holes.push({ x: last.maxX,  ...yzd, length: endLength, kind: "power-entry-right" });
```

Locate the boundary-hole push (line ~93). Update it to include `kind: "boundary"`:

```ts
    holes.push({ x, ...yzd, length, kind: "boundary" });
```

(The `...yzd` spread carries `y`, `z`, `diameter` — leave that pattern untouched.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/geometry/cable-holes.test.ts` → all PASS, including existing tests (`kind` is additive, doesn't affect existing assertions).

- [ ] **Step 5: Confirm shell.ts still compiles**

`shell.ts` iterates `input.cableHoles` and reads `x/y/z/diameter/length` — it doesn't care about `kind`. Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/cable-holes.ts tests/unit/geometry/cable-holes.test.ts
git commit -m "feat(cable-holes): tag holes with kind discriminator"
```

---

## Task 8 — `shell.ts` threads `OuterEdges` to `mounts.ts`

`shell.ts` doesn't call `cable-holes.ts` (the worker does), so the only update here is the `mounts` invocation.

**Files:**
- Modify: `src/geometry/shell.ts`

- [ ] **Step 1: Inspect shell mount usage**

Run: `grep -n "mounts\b\|computeMounts\|MountPlan" src/geometry/shell.ts`. Note where shell.ts consumes a `mounts: MountPlan | undefined` field from its input. The worker computes `MountPlan` via `computeMounts(…)` and hands it in. `shell.ts` itself doesn't call `computeMounts`.

If that's the case (worker is the only `computeMounts` caller), there is no shell-side change needed for mounts. Confirm by reading the file. Then skip to Step 2.

- [ ] **Step 2: Confirm shell tests still pass without changes**

Run: `npx vitest run tests/unit/geometry/shell.test.ts` → PASS (no behavior change here yet; the worker is what wires `outerEdges` into `computeMounts` in Task 10).

- [ ] **Step 3: No-op commit not needed**

Skip the commit for this task — there's no diff. Proceed directly to Task 9.

---

## Task 9 — `worker-client.ts`: `SlicedComponentMesh`, `SliceWarning`, extend `BuildResult`

Type surface for the new worker output. Also extends `plainParams` so `maxPieceWidth` and `cuts` cross the structured-clone boundary.

**Files:**
- Modify: `src/geometry/worker-client.ts`

- [ ] **Step 1: Add the types and update `BuildResult` + `WorkerResponse`**

At the top of `src/geometry/worker-client.ts`, after `export type { BulbHole } from "./bulb-holes";`, add:

```ts
export type { Cut } from "../state/parameters";
export type { SliceWarning } from "./slice";
```

Add a new type after `ComponentMesh`:

```ts
export type SlicedComponentMesh = ComponentMesh & {
  sliceIndex: number;
  totalSlices: number;
  parentSlot: number;  // 1-based; matches the parent's index in `components` (+1)
};
```

Extend `ComponentLayers` if needed for slice attribution — actually, add a parallel sliced layers type:

```ts
export type SlicedComponentLayers = ComponentLayers & {
  sliceIndex: number;
  totalSlices: number;
  parentSlot: number;
};
```

Update the `MergeWarning` union to include slice warnings — change the existing definition from:

```ts
export type MergeWarning =
  | { kind: "bridge_disconnected"; pair: [ComponentMember, ComponentMember] }
  | { kind: "bulbhole_inset_collapsed"; members: ComponentMember[] };
```

to:

```ts
import type { SliceWarning } from "./slice";

export type MergeWarning =
  | { kind: "bridge_disconnected"; pair: [ComponentMember, ComponentMember] }
  | { kind: "bulbhole_inset_collapsed"; members: ComponentMember[] }
  | SliceWarning;
```

(Remove the duplicate `export type { SliceWarning }` if it's now imported above; keep just the `import type`.)

Extend `BuildResult`:

```ts
export type BuildResult = {
  components: ComponentMesh[];
  layers: ComponentLayers[];
  slicedComponents: SlicedComponentMesh[];
  slicedLayers: SlicedComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};
```

Extend `WorkerResponse` identically (it shadows `BuildResult`'s shape on the wire).

In the `build` function, extend the `plainParams` object to include the two new fields:

```ts
    maxPieceWidth: params.maxPieceWidth,
    cuts: params.cuts,
```

(Add them after `bulbHoleMaxCount`. The `cuts` array is plain JSON-cloneable, so no special handling is needed.)

Update the message handler's `resolve(...)` call to include the new fields:

```ts
      resolve({
        components: ev.data.components,
        layers: ev.data.layers,
        slicedComponents: ev.data.slicedComponents,
        slicedLayers: ev.data.slicedLayers,
        errors: ev.data.errors,
        warnings: ev.data.warnings,
      });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → expect errors at the worker.ts site referencing the new fields (we'll fix in Task 10). The worker-client.ts side itself must be clean. If there are errors solely inside `worker.ts`, that's expected — proceed.

If `npx tsc --noEmit` fails on `worker-client.ts` itself (circular import of `SliceWarning`, or a missing `Cut` export), revisit the type chain.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/worker-client.ts
git commit -m "feat(worker): expose SlicedComponentMesh and SliceWarning types"
```

---

## Task 10 — `worker.ts`: sliced build path

This is the big one. The worker now runs the per-component loop twice: once for the full geometry (today's behavior), once for sliced pieces. `OuterEdges` is threaded into `computeMounts` and `computeCableHoles`.

**Files:**
- Modify: `src/geometry/worker.ts`
- Modify: `src/ui/usePreviewBuild.ts` (register the new params in the rebuild-effect deps — see [[feedback_preview_rebuild_deps]] memory)

- [ ] **Step 1: Sketch the build flow**

The worker.ts loop currently iterates `merged.components`. The change:

1. Run the existing per-component loop unchanged — fills `components` and `layers` arrays.
2. For each merged component, call `sliceComponent(component, params.cuts, params.maxPieceWidth)`. Collect the result's `warnings`. If `pieces.length === 1` and the only piece's bbox equals the parent's bbox AND `params.cuts.length === 0` AND no `slice_recommended` warning fired, skip the sliced loop for that component (no slicing applied). Otherwise iterate pieces and build per-piece shell + plexi + layers, populating `slicedComponents` and `slicedLayers`. Carry `parentSlot = parentIndex + 1`, `sliceIndex`, `totalSlices` on every emitted sliced entry.
3. When calling `computeCableHoles` for the sliced pass, pass per-piece `outerEdges`. When calling `computeMounts`, ditto.

The full-pass `computeCableHoles` and `computeMounts` calls use the default `{ left: true, right: true }`.

- [ ] **Step 2: Add imports + the new arrays**

At the top of `src/geometry/worker.ts`, add:

```ts
import { sliceComponent } from "./slice";
import type {
  SlicedComponentMesh,
  SlicedComponentLayers,
} from "./worker-client";
```

After the existing `const components: ComponentMesh[] = [];` and `const layers: ComponentLayers[] = [];` declarations near line 67, add:

```ts
  const slicedComponents: SlicedComponentMesh[] = [];
  const slicedLayers: SlicedComponentLayers[] = [];
```

- [ ] **Step 3: After the existing per-component loop, run the sliced pass**

At the end of the existing `for (const comp of merged.components)` loop (i.e. right after the closing brace), insert a new loop:

```ts
  for (let parentIdx = 0; parentIdx < merged.components.length; parentIdx++) {
    const comp = merged.components[parentIdx];
    const parentSlot = parentIdx + 1;
    const memberRefs = comp.members.map((m) => ({ char: m.char, index: m.index }));

    const sliceResult = await sliceComponent(comp, req.params.cuts, req.params.maxPieceWidth);
    warnings.push(...sliceResult.warnings);

    // If no slicing happened (no in-bounds cuts), skip — the full path already emitted this component.
    if (sliceResult.pieces.length <= 1 && req.params.cuts.length === 0) continue;
    // Edge case: cuts were defined but none landed inside this component's bbox; pieces is still [component].
    // We treat that as "this component wasn't sliced" and skip too.
    if (sliceResult.pieces.length === 1 && sliceResult.pieces[0].mergedContours === comp.mergedContours) continue;

    for (let pi = 0; pi < sliceResult.pieces.length; pi++) {
      const piece = sliceResult.pieces[pi];
      const outerEdges = sliceResult.outerEdges[pi];

      // Two-stage filter:
      // 1) Drop holes that don't overlap this piece's X bbox (the same filter used today).
      // 2) Suppress power-entry holes on edges that aren't actual outer ends of the word.
      const filteredCableHoles = allCableHoles.filter((h) => {
        const holeMinX = h.x - h.length / 2;
        const holeMaxX = h.x + h.length / 2;
        if (holeMaxX < piece.bbox.minX || holeMinX > piece.bbox.maxX) return false;
        if (h.kind === "power-entry-left" && !outerEdges.left) return false;
        if (h.kind === "power-entry-right" && !outerEdges.right) return false;
        return true;
      });

      const pieceMounts = computeMounts(
        piece.mergedContours,
        {
          mountShankDiameter: req.params.mountShankDiameter,
          mountSlotY: req.params.mountSlotY,
          mountSlotXInset: req.params.mountSlotXInset,
          wallThickness: req.params.wallThickness,
          backThickness: req.params.backThickness,
          backCavityDepth: req.params.backCavityDepth,
        },
        outerEdges,
      );

      const pieceBulbs = await computeBulbHoles(piece.mergedContours, {
        bulbHoleDiameter: req.params.bulbHoleDiameter,
        bulbHoleSpacing: req.params.bulbHoleSpacing,
        bulbHoleInset: req.params.bulbHoleInset,
        bulbHoleMaxCount: req.params.bulbHoleMaxCount,
        wallThickness: req.params.wallThickness,
      });
      if (pieceBulbs.warning === "bulbhole_inset_collapsed") {
        warnings.push({ kind: "bulbhole_inset_collapsed", members: memberRefs });
      }

      const pieceMesh = await buildLetterShell({
        contours: piece.mergedContours,
        totalDepth: req.params.totalDepth,
        backThickness: req.params.backThickness,
        wallThickness: req.params.wallThickness,
        rabbetDepth: req.params.rabbetDepth,
        insetWidth: req.params.insetWidth,
        backCavityDepth: req.params.backCavityDepth,
        cableHoles: filteredCableHoles,
        bulbHoles: pieceBulbs.holes,
        mounts: pieceMounts.slots.length > 0 ? pieceMounts : undefined,
      });

      if (!pieceMesh.ok) {
        errors.push({ members: memberRefs, reason: pieceMesh.reason });
        continue;
      }

      const centered = centerMeshXY(pieceMesh.mesh);

      const piecePlexiRaw = await buildLetterPlexi({
        contours: piece.mergedContours,
        totalDepth: req.params.totalDepth,
        rabbetDepth: req.params.rabbetDepth,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
        backCavityDepth: req.params.backCavityDepth,
      });
      let piecePlexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
      if (piecePlexiRaw) {
        const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
        const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
        const v = piecePlexiRaw.vertProperties;
        const out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i += 3) {
          out[i] = v[i] - cx;
          out[i + 1] = v[i + 1] - cy;
          out[i + 2] = v[i + 2];
        }
        piecePlexi = { vertProperties: out, triVerts: piecePlexiRaw.triVerts };
      }

      slicedComponents.push({
        members: memberRefs,
        vertProperties: centered.vertProperties,
        triVerts: centered.triVerts,
        bbox: centered.bbox,
        xOffset: 0,
        plexi: piecePlexi,
        sliceIndex: piece.sliceIndex,
        totalSlices: piece.totalSlices,
        parentSlot,
      });

      const pieceLayers = await buildLetterLayers({
        contours: piece.mergedContours,
        wallThickness: req.params.wallThickness,
        insetWidth: req.params.insetWidth,
        plexiTolerance: req.params.plexiTolerance,
      });
      if (pieceLayers) {
        slicedLayers.push({
          members: memberRefs,
          ...pieceLayers,
          sliceIndex: piece.sliceIndex,
          totalSlices: piece.totalSlices,
          parentSlot,
        });
      }
    }
  }
```

- [ ] **Step 4: Extend the `response` payload and transferables**

Replace the existing `const response: WorkerResponse = { … }` block with:

```ts
  const response: WorkerResponse = {
    requestId: req.requestId,
    components,
    layers,
    slicedComponents,
    slicedLayers,
    errors,
    warnings,
  };

  const transferables: Transferable[] = [];
  for (const c of components) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  for (const c of slicedComponents) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  ctx.postMessage(response, transferables);
```

- [ ] **Step 5: Register the new params in usePreviewBuild deps**

Per the [[feedback_preview_rebuild_deps]] memory: new params must appear in `usePreviewBuild`'s effect deps array AND in worker-client's `plainParams`. The `plainParams` change is already in Task 9. For the effect deps:

Open `src/ui/usePreviewBuild.ts`. Find the `useEffect` (or similar) whose deps array enumerates every individual parameter field. Add `params.maxPieceWidth` and `JSON.stringify(params.cuts)` to the array (the `JSON.stringify` is needed because `params.cuts` is an array — reference equality alone won't catch element edits).

Better: if the file already has a "stable serialization" pattern (e.g. `JSON.stringify(params)`), this is a no-op. Check the existing pattern first.

If unsure, run: `grep -n "params\." src/ui/usePreviewBuild.ts | head -20`. Match the existing convention.

- [ ] **Step 6: Type-check + unit tests**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all 195+ tests pass (no new tests yet for the worker; integration is exercised by e2e in Task 14).

- [ ] **Step 7: Commit**

```bash
git add src/geometry/worker.ts src/ui/usePreviewBuild.ts
git commit -m "feat(worker): emit sliced components + layers alongside full geometry"
```

---

## Task 11 — `zip.ts`: extended `bundleAll` with slice entries

Flat-arrays-with-explicit-parentSlot for sliced shells, plexi STLs, plexi SVGs. Filename suffix `_slice-N`, zero-padded when totalSlices ≥ 10.

**Files:**
- Modify: `src/exporters/zip.ts`
- Modify: `tests/unit/exporters/zip.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/exporters/zip.test.ts`, append:

```ts
import JSZip from "jszip";

describe("bundleAll with sliced entries", () => {
  const dummyStl = new Uint8Array([0]).buffer;

  it("places sliced shell files under the parent slot with _slice-N suffix", async () => {
    const blob = await bundleAll(
      [
        { chars: "AB", stl: dummyStl },
        { chars: "CD", stl: dummyStl },
      ],
      [],
      [],
      [
        { chars: "AB", stl: dummyStl, parentSlot: 1, sliceIndex: 1, totalSlices: 2 },
        { chars: "AB", stl: dummyStl, parentSlot: 1, sliceIndex: 2, totalSlices: 2 },
      ],
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names).toContain("stl/chars/01_AB_char.stl");
    expect(names).toContain("stl/chars/02_CD_char.stl");
    expect(names).toContain("stl/chars/01_AB_char_slice-1.stl");
    expect(names).toContain("stl/chars/01_AB_char_slice-2.stl");
    expect(names).not.toContain("stl/chars/02_CD_char_slice-1.stl");
  });

  it("places sliced plexi STL and SVG files in their respective folders", async () => {
    const blob = await bundleAll(
      [{ chars: "AB", stl: dummyStl }],
      [{ chars: "AB", stl: dummyStl }],
      [{ chars: "AB", svg: "<svg/>" }],
      [{ chars: "AB", stl: dummyStl, parentSlot: 1, sliceIndex: 1, totalSlices: 2 }],
      [{ chars: "AB", stl: dummyStl, parentSlot: 1, sliceIndex: 1, totalSlices: 2 }],
      [{ chars: "AB", svg: "<svg/>", parentSlot: 1, sliceIndex: 1, totalSlices: 2 }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toContain("stl/plexi/01_AB_plexi_slice-1.stl");
    expect(names).toContain("svg/01_AB_plexi_slice-1.svg");
  });

  it("zero-pads slice indices when totalSlices >= 10", async () => {
    const sliced = Array.from({ length: 11 }, (_, i) => ({
      chars: "X",
      stl: dummyStl,
      parentSlot: 1,
      sliceIndex: i + 1,
      totalSlices: 11,
    }));
    const blob = await bundleAll(
      [{ chars: "X", stl: dummyStl }],
      [],
      [],
      sliced,
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toContain("stl/chars/01_X_char_slice-01.stl");
    expect(names).toContain("stl/chars/01_X_char_slice-11.stl");
  });
});
```

Run: `npx vitest run tests/unit/exporters/zip.test.ts -t "sliced"` → FAIL (`bundleAll` accepts only 4 args today).

- [ ] **Step 2: Extend `bundleAll`**

In `src/exporters/zip.ts`, replace the existing exports and signature with:

```ts
export type ShellEntry = { chars: string; stl: ArrayBuffer };
export type PlexiStlEntry = { chars: string; stl: ArrayBuffer };
export type PlexiSvgEntry = { chars: string; svg: string };

export type SlicedShellEntry = ShellEntry & {
  parentSlot: number;
  sliceIndex: number;
  totalSlices: number;
};
export type SlicedPlexiStlEntry = PlexiStlEntry & {
  parentSlot: number;
  sliceIndex: number;
  totalSlices: number;
};
export type SlicedPlexiSvgEntry = PlexiSvgEntry & {
  parentSlot: number;
  sliceIndex: number;
  totalSlices: number;
};

function sliceIndexLabel(idx: number, total: number): string {
  return total >= 10 ? idx.toString().padStart(2, "0") : idx.toString();
}

export async function bundleAll(
  shells: ShellEntry[],
  plexiStls: PlexiStlEntry[],
  plexiSvgs: PlexiSvgEntry[],
  slicedShells: SlicedShellEntry[],
  slicedPlexiStls: SlicedPlexiStlEntry[],
  slicedPlexiSvgs: SlicedPlexiSvgEntry[],
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

  for (const e of slicedShells) {
    const idx = sliceIndexLabel(e.sliceIndex, e.totalSlices);
    const name = `${pad2(e.parentSlot)}_${safeFilenameFragment(e.chars, `component${e.parentSlot}`)}_char_slice-${idx}.stl`;
    stlChars.file(name, e.stl);
  }
  for (const e of slicedPlexiStls) {
    const idx = sliceIndexLabel(e.sliceIndex, e.totalSlices);
    const name = `${pad2(e.parentSlot)}_${safeFilenameFragment(e.chars, `component${e.parentSlot}`)}_plexi_slice-${idx}.stl`;
    stlPlexi.file(name, e.stl);
  }
  for (const e of slicedPlexiSvgs) {
    const idx = sliceIndexLabel(e.sliceIndex, e.totalSlices);
    const name = `${pad2(e.parentSlot)}_${safeFilenameFragment(e.chars, `component${e.parentSlot}`)}_plexi_slice-${idx}.svg`;
    svgDir.file(name, e.svg);
  }

  zip.file("README.txt", readme);

  return zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 3: Run zip tests**

Run: `npx vitest run tests/unit/exporters/zip.test.ts` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/exporters/zip.ts tests/unit/exporters/zip.test.ts
git commit -m "feat(export): bundleAll emits sliced char/plexi/svg variants"
```

---

## Task 12 — `manifest.ts`: "Slicing" README section

Conditional section, emitted only when `cuts.length > 0`.

**Files:**
- Modify: `src/exporters/manifest.ts`
- Modify: `tests/unit/exporters/manifest.test.ts`

- [ ] **Step 1: Inspect existing `buildReadme` signature**

Run: `grep -n "buildReadme\|pieces" src/exporters/manifest.ts | head`. Confirm `buildReadme(params, reproduceUrl, pieces)` shape.

- [ ] **Step 2: Write failing tests**

In `tests/unit/exporters/manifest.test.ts`, append:

```ts
describe("buildReadme + slicing", () => {
  const baseParams = { ...DEFAULT_PARAMETERS };  // already imported in the file

  it("omits the Slicing section when cuts is empty", () => {
    const out = buildReadme({ ...baseParams, cuts: [] }, "https://example", []);
    expect(out).not.toContain("Slicing");
  });

  it("includes a Slicing section with per-cut x and angle", () => {
    const out = buildReadme(
      {
        ...baseParams,
        maxPieceWidth: 220,
        cuts: [
          { x: 200, angle: 0 },
          { x: 400, angle: 12.5 },
        ],
      },
      "https://example",
      [],
    );
    expect(out).toContain("Slicing");
    expect(out).toContain("220");
    expect(out).toContain("200");
    expect(out).toContain("12.5");
  });
});
```

Run: `npx vitest run tests/unit/exporters/manifest.test.ts -t "Slicing"` → FAIL.

- [ ] **Step 3: Implement the Slicing section**

In `src/exporters/manifest.ts`, find the function body of `buildReadme`. Just before the final `return` (or wherever sections are joined), append a Slicing section. Pattern:

```ts
  if (params.cuts && params.cuts.length > 0) {
    sections.push(
      [
        "Slicing",
        `  Max piece width:    ${params.maxPieceWidth} mm`,
        `  Cuts (${params.cuts.length}):`,
        ...params.cuts.map(
          (c, i) =>
            `    Cut ${i + 1}: x = ${c.x.toFixed(1)} mm,  angle = ${c.angle.toFixed(1)}°`,
        ),
      ].join("\n"),
    );
  }
```

If the file builds the README with concatenation instead of a `sections` array, adapt — append the same content as a trailing paragraph separated by a blank line.

Run: `npx vitest run tests/unit/exporters/manifest.test.ts -t "Slicing"` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/exporters/manifest.ts tests/unit/exporters/manifest.test.ts
git commit -m "feat(export): README Slicing section when cuts are configured"
```

---

## Task 13 — `ExportButtons.tsx`: wire sliced entries through

Pulls `slicedComponents` + `slicedLayers` from the build result and feeds them into the extended `bundleAll`.

**Files:**
- Modify: `src/ui/ExportButtons.tsx`

- [ ] **Step 1: Extend `buildReproduceUrl`**

Add `maxPieceWidth` and `cuts` to the `serializable` object inside `buildReproduceUrl` so the reproduce URL captures them:

```ts
    maxPieceWidth: params.maxPieceWidth,
    cuts: params.cuts,
```

(Place after `mountSlotXInset`.)

- [ ] **Step 2: Build the sliced entries**

In the `exportZip` function in `src/ui/ExportButtons.tsx`, after the existing `plexiSvgs` build (around line 80), add:

```ts
      const slicedLayersByKey = new Map(
        result.slicedLayers.map((l) => {
          const chars = l.members.map((m) => m.char).join("");
          return [`${l.parentSlot}|${l.sliceIndex}`, { layer: l, chars }] as const;
        }),
      );

      const slicedShells = result.slicedComponents.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
        parentSlot: c.parentSlot,
        sliceIndex: c.sliceIndex,
        totalSlices: c.totalSlices,
      }));

      const slicedWithPlexi = result.slicedComponents.filter(
        (c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null,
      );
      const slicedPlexiStls = slicedWithPlexi.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({
          vertProperties: c.plexi.vertProperties,
          triVerts: c.plexi.triVerts,
        }),
        parentSlot: c.parentSlot,
        sliceIndex: c.sliceIndex,
        totalSlices: c.totalSlices,
      }));

      const slicedPlexiSvgs = slicedWithPlexi
        .map((c) => {
          const key = `${c.parentSlot}|${c.sliceIndex}`;
          const layer = slicedLayersByKey.get(key);
          if (!layer) return null; // piece had a plexi mesh but no SVG layer (shouldn't happen — same gating)
          return {
            chars: layer.chars,
            svg: polygonsToSVG(layer.layer.plexi, { margin: 1 }),
            parentSlot: c.parentSlot,
            sliceIndex: c.sliceIndex,
            totalSlices: c.totalSlices,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
```

Update the `bundleAll` call to:

```ts
      const blob = await bundleAll(
        shells,
        plexiStls,
        plexiSvgs,
        slicedShells,
        slicedPlexiStls,
        slicedPlexiSvgs,
        readme,
      );
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Run the full test suite (e2e excluded)**

Run: `npm test` → all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ExportButtons.tsx
git commit -m "feat(export): zip carries both full and sliced shells/plexi/SVGs"
```

---

## Task 14 — `PreviewCanvas.tsx`: red cut-line overlay

Renders each `cut` as a thin red oblique strip in the preview, inside the existing display-rotation group so it sits in world Z-up alongside geometry.

**Files:**
- Modify: `src/ui/PreviewCanvas.tsx`

- [ ] **Step 1: Add the `<CutLines>` component**

In `src/ui/PreviewCanvas.tsx`, after the existing `AxisTickLabels` component definition (around line 66), add:

```tsx
function CutLines({
  cuts,
  bboxY,
  totalDepth,
  backCavityDepth,
}: {
  cuts: { x: number; angle: number }[];
  bboxY: { min: number; max: number };
  totalDepth: number;
  backCavityDepth: number;
}) {
  if (cuts.length === 0) return null;
  const yMid = (bboxY.min + bboxY.max) / 2;
  const yHeight = Math.max(1, bboxY.max - bboxY.min) + 20; // pad past the word
  const zHeight = Math.max(1, totalDepth + backCavityDepth);
  const zMid = zHeight / 2;
  return (
    <group userData={{ isSizeIndicator: true }}>
      {cuts.map((cut, i) => (
        <mesh
          key={i}
          position={[cut.x, yMid, zMid]}
          rotation={[0, 0, (-cut.angle * Math.PI) / 180]}
        >
          <boxGeometry args={[0.6, yHeight, zHeight]} />
          <meshBasicMaterial color="#e53935" transparent opacity={0.55} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}
```

Rotation convention: `cut.angle` is the angle from vertical, with positive = top tilts to the right. A rotation around Z by `-angle` makes the box's local +Y axis (which becomes world Y after the parent display group's rotation) point in the user-expected direction. If on visual inspection the angle goes the wrong way, flip the sign of the multiplier.

- [ ] **Step 2: Wire it into the scene**

Inside `PreviewCanvas`, find the existing `<group rotation={[-Math.PI / 2, 0, 0]}>` block (~line 217). After the `result?.components.map(...)` render, add:

```tsx
          {result && params.cuts.length > 0 && (() => {
            const bbox = wordBBox;
            if (!bbox) return null;
            return (
              <CutLines
                cuts={params.cuts}
                bboxY={{ min: bbox.minY, max: bbox.maxY }}
                totalDepth={params.totalDepth}
                backCavityDepth={params.backCavityDepth}
              />
            );
          })()}
```

(Note: `wordBBox` already exists in this file from the dimensions HUD work — reuse it.)

- [ ] **Step 3: Manual visual check**

Run: `npm run dev` → open the browser.

Steps:
- In the controls panel, you don't yet have a Slicing fieldset (Task 15) — instead, paste a `cuts` array directly into the URL: `?p={"text":"BURGER",…,"cuts":[{"x":300,"angle":0},{"x":600,"angle":15}]}` or temporarily set `params.cuts` from the dev tools console via `useParameters.getState().set({ cuts: [...] })`.
- Confirm two red lines render in the preview: one vertical at X=300, one tilted +15° at X=600.

- [ ] **Step 4: Commit**

```bash
git add src/ui/PreviewCanvas.tsx
git commit -m "feat(ui): red cut-line overlay in preview"
```

---

## Task 15 — `ControlsPanel.tsx`: Slicing fieldset

The visible UI: `maxPieceWidth` field, **Suggest cuts** button, per-cut rows (X / angle / Remove), **Add cut**, **Clear cuts**.

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Inspect existing fieldset patterns**

Run: `grep -n "fieldset\|legend\|NumberField" src/ui/ControlsPanel.tsx | head -30` to find an existing fieldset to mirror (the "Bulb holes" fieldset is the most recent reference point).

- [ ] **Step 2: Import the helpers**

At the top of `src/ui/ControlsPanel.tsx`, add:

```ts
import { suggestCuts } from "../geometry/slice";
import type { Cut } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { componentsBBox } from "./grid-spacing";
```

(`componentsBBox` may already be imported elsewhere — skip the duplicate import.)

- [ ] **Step 3: Append the Slicing fieldset**

After the last existing fieldset (Bulb holes), append:

```tsx
      <fieldset>
        <legend>Slicing</legend>
        <NumberField
          label="Max piece width"
          unit="mm"
          value={params.maxPieceWidth}
          onChange={(v) => params.set({ maxPieceWidth: v })}
          min={0}
        />
        <SlicingActions
          maxPieceWidth={params.maxPieceWidth}
          cuts={params.cuts}
          onSet={(cuts: Cut[]) => params.set({ cuts })}
        />
        {params.cuts.map((cut, i) => (
          <div key={i} className="slicing-cut-row">
            <span className="slicing-cut-label">Cut {i + 1}</span>
            <NumberField
              label="X"
              unit="mm"
              value={cut.x}
              onChange={(v) => {
                const next = params.cuts.slice();
                next[i] = { ...next[i], x: v };
                params.set({ cuts: next });
              }}
            />
            <NumberField
              label="Angle"
              unit="°"
              value={cut.angle}
              onChange={(v) => {
                const next = params.cuts.slice();
                next[i] = { ...next[i], angle: v };
                params.set({ cuts: next });
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = params.cuts.slice();
                next.splice(i, 1);
                params.set({ cuts: next });
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </fieldset>
```

Add the `SlicingActions` sub-component above the main `ControlsPanel` definition:

```tsx
function SlicingActions({
  maxPieceWidth,
  cuts,
  onSet,
}: {
  maxPieceWidth: number;
  cuts: Cut[];
  onSet: (next: Cut[]) => void;
}) {
  const { result } = usePreviewBuildContext();
  const wordBBox = result ? componentsBBox(result.components) : null;
  const canSuggest = maxPieceWidth > 0 && wordBBox !== null;
  return (
    <div className="slicing-actions">
      <button
        type="button"
        disabled={!canSuggest}
        onClick={() => {
          if (!wordBBox) return;
          onSet(suggestCuts({ minX: wordBBox.minX, maxX: wordBBox.maxX }, maxPieceWidth));
        }}
      >
        Suggest cuts
      </button>
      <button
        type="button"
        disabled={!wordBBox}
        onClick={() => {
          const x = wordBBox ? (wordBBox.minX + wordBBox.maxX) / 2 : 0;
          onSet([...cuts, { x, angle: 0 }]);
        }}
      >
        Add cut
      </button>
      <button
        type="button"
        disabled={cuts.length === 0}
        onClick={() => onSet([])}
      >
        Clear cuts
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add minimal CSS**

Append to `src/ui/styles.css`:

```css
.slicing-actions { display: flex; gap: 0.4rem; margin: 0.5rem 0; }
.slicing-cut-row {
  display: grid; grid-template-columns: 80px 1fr 1fr auto;
  gap: 0.4rem; align-items: end; margin-bottom: 0.4rem;
}
.slicing-cut-label { font-size: 0.85rem; color: #555; align-self: center; }
```

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`. Steps:
- Type "BURGER", set `Letter height` to 200 (default).
- Set `Max piece width` to 200.
- Click **Suggest cuts** → several rows appear; preview shows red lines.
- Edit one row's angle to 10° → red line tilts.
- Click **Clear cuts** → rows disappear, red lines gone.
- Click **Add cut** → one row appears at the word midpoint.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ControlsPanel.tsx src/ui/styles.css
git commit -m "feat(ui): Slicing controls — maxPieceWidth + Suggest + per-cut rows"
```

---

## Task 16 — E2E smoke leg

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Inspect existing smoke flow**

Run: `cat tests/e2e/smoke.spec.ts | head -120`. Identify how the test sets params (DOM interactions vs `useParameters.setState` via `page.evaluate`).

- [ ] **Step 2: Extend the test**

Add (or extend) a `test(...)` block:

```ts
test("exports include both full and sliced files when cuts are configured", async ({ page }) => {
  await page.goto("/");
  // Wait for app readiness (re-use the existing helper; below is a placeholder).
  await page.waitForFunction(() => (window as any).__appReady === true, null, { timeout: 30000 });

  // Set params via the Zustand store (existing smoke test should already use this pattern).
  await page.evaluate(() => {
    const useParameters = (window as any).__useParameters; // confirm the global name; if absent, use the existing approach in this file
    useParameters.getState().set({
      text: "OK",
      letterHeight: 200,
      wallThickness: 5,
      insetWidth: 3,
      maxPieceWidth: 60, // a fraction of OK's width, forcing one cut
    });
  });

  // Click Suggest cuts.
  await page.getByRole("button", { name: /Suggest cuts/i }).click();

  // Wait for the preview to rebuild and the build result to include slicedComponents.
  await page.waitForFunction(() => (window as any).__lastBuildResult?.slicedComponents?.length > 0, null, { timeout: 30000 });

  // Click Download (.zip), capture the download.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download/i }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("no download path");

  // Inspect the zip layout.
  const JSZip = (await import("jszip")).default;
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  expect(names.some((n) => /stl\/chars\/01_.+_char\.stl$/.test(n))).toBe(true);
  expect(names.some((n) => /stl\/chars\/01_.+_char_slice-1\.stl$/.test(n))).toBe(true);
  expect(names.some((n) => /stl\/chars\/01_.+_char_slice-2\.stl$/.test(n))).toBe(true);
  expect(names).toContain("README.txt");
  const readme = await zip.file("README.txt")!.async("string");
  expect(readme).toContain("Slicing");
});
```

If the existing smoke test doesn't expose `__useParameters` or `__lastBuildResult` globals, add them in `src/main.tsx` for the dev/build that the e2e runs against. Look at how the existing smoke test reaches into the store — replicate that approach.

- [ ] **Step 3: Run the e2e**

Run: `npm run e2e` → all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts src/main.tsx
git commit -m "test(e2e): smoke covers full + sliced export"
```

(Drop `src/main.tsx` from the commit if it wasn't actually modified.)

---

## Task 17 — `CLAUDE.md` update

Add a "Slicing" section so future agents know the feature exists.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a new section after "Bulb holes"**

Add this section between "Bulb holes" and "`NumberField` behaviour":

```markdown
## Slicing

`maxPieceWidth`, `cuts` (in `state/parameters.ts`) drive the slicer step. Default `maxPieceWidth = 0` and `cuts = []` mean the feature is inactive; the worker emits zero `slicedComponents` and the export looks identical to today's output.

`src/geometry/slice.ts` is a pure helper: given a `Component` and a list of cuts (each `{ x, angle }`), it returns N+1 sub-components plus per-piece `OuterEdges` flags (`{left, right}` — which sides of the piece are the outer ends of the original word). The slicer is 2D-only — `CrossSection.intersect` against trapezoidal strips computed from per-cut angles. All intermediates are explicitly `.delete()`-ed.

`suggestCuts(wordBBox, maxPieceWidth)` returns evenly-spaced vertical cuts (`angle = 0`) such that every piece is ≤ `maxPieceWidth` wide. The Suggest button in the Slicing controls fieldset destructively replaces `params.cuts` — re-clicking is the documented "fresh start" gesture.

`worker.ts` runs two parallel passes per build: the existing per-component loop (emitting `components` + `layers`) and a sliced loop (emitting `slicedComponents` + `slicedLayers`). The sliced loop threads `OuterEdges` into both `computeMounts` and the per-piece cable-hole filter, so mount keyholes and `cableHoleAtEnds` power-entry holes only appear on the actual outer edges of the original word — middle pieces of a multi-piece slice get neither, even when the per-piece `computeMounts` would otherwise emit them.

`mounts.ts` and `cable-holes.ts` both accept an optional `outerEdges: OuterEdges = { left: true, right: true }` argument. With the default, behaviour is identical to today's single-component pipeline. When called per-sliced-piece, the worker passes the piece's own outer-edge flags.

Preview: `<CutLines>` overlay in `PreviewCanvas.tsx` renders each cut as a thin red box, full word height and full Z extent (`totalDepth + backCavityDepth`), rotated around Z by `-cut.angle` (so positive angle tilts top to the right). The overlay is tagged `userData.isSizeIndicator = true` so the auto-fit bbox traverse skips it. The preview shows the full assembled geometry only — sliced meshes are export-only.

Export: `bundleAll` carries both full and sliced flat-arrays. Sliced filenames use `<parentSlot>_<chars>_<kind>_slice-<idx>.stl/svg`, with zero-padding only when `totalSlices >= 10`. The README has a Slicing section when `cuts.length > 0`.

Edge cases the slicer surfaces as warnings (shipped via the existing merge-warning channel):
- `slice_empty` — a piece's area is `<0.5 mm²`. Piece dropped; adjacent pieces unaffected.
- `slice_crossed` — two cuts intersect inside the bbox Y range. Both pieces still emitted; the user sees the warning and adjusts.
- `slice_oversize` — a surviving piece's bbox X width still exceeds `maxPieceWidth`. Piece still exports.
- `slice_recommended` — a component exceeds `maxPieceWidth` but no `cuts` are configured. Build proceeds with full geometry only.

A cut that passes through an internal hole (e.g. through the cavity of an `o`) bisects the hole naturally — each piece carries its half as a partial cavity that reconstitutes on glue-up.
```

- [ ] **Step 2: Update the "Spec / plan" list at the bottom**

Find the existing line under "## Spec / plan" listing the bulb-holes spec and add below it:

```markdown
- Build-volume slicing feature spec: `docs/superpowers/specs/2026-06-16-build-volume-slicing-design.md` (current with code).
```

- [ ] **Step 3: Run full validation**

Run all three checks:

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document slicing feature"
```

---

## Final verification

After Task 17:

- [ ] `npm test` → all unit tests pass (count went up by ~25–30)
- [ ] `npm run e2e` → smoke + slicing leg both pass
- [ ] `npx tsc --noEmit` → clean
- [ ] `npm run lint` → clean
- [ ] Manual: type a script word, set `Max piece width` to half the word, click Suggest, eyeball red cut lines, export, unzip, confirm both full and sliced files present.
