# Cable Holes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drill horizontal cylindrical cable channels through the side walls between adjacent letters, with optional power-entry holes on the leftmost and rightmost outer walls of the entire word.

**Architecture:** A new pure helper `src/geometry/cable-holes.ts` computes cylinder specs in word space from the layout + per-glyph contour bboxes. The worker calls it once per build and per-component filters holes by X-bbox overlap. `buildLetterShell` accepts an optional `cableHoles` array and subtracts each cylinder from the shell manifold. Disabled by default (`cableHoleDiameter = 0`), so the existing geometry is unchanged for users who don't opt in.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), manifold-3d (WASM CSG), Vitest unit tests.

**Spec:** `docs/superpowers/specs/2026-06-10-cable-holes-design.md`

---

## File Structure

| File | Role | Status |
|---|---|---|
| `src/state/parameters.ts` | New fields + `DEFAULT_BACK_CAVITY_DEPTH` constant | Modify |
| `src/state/persistence.ts` | `migrate()` defaults + `ser` literal | Modify |
| `src/geometry/validate.ts` | Bounds checks for new numeric fields | Modify |
| `src/geometry/worker-client.ts` | `plainParams: Parameters` literal includes new fields | Modify |
| `src/ui/ExportButtons.tsx` | `serializable` includes new fields | Modify |
| `src/geometry/cable-holes.ts` | Pure helper: layout + contours + params → cylinder specs | Create |
| `src/geometry/shell.ts` | `ShellInputs.cableHoles?` + subtract loop | Modify |
| `src/geometry/worker.ts` | `computeCableHoles` + per-component filter + pass to shell | Modify |
| `src/exporters/manifest.ts` | README adds 4 lines | Modify |
| `src/ui/ControlsPanel.tsx` | New "Cable holes" fieldset | Modify |
| `tests/unit/geometry/cable-holes.test.ts` | Helper tests | Create |
| `tests/unit/geometry/shell.test.ts` | Drilling smoke + no-op | Modify |
| `tests/unit/state/parameters.test.ts` | Default-value assertions | Modify |
| `tests/unit/state/persistence.test.ts` | Migration tests | Modify |
| `tests/unit/geometry/validate.test.ts` | Bounds tests | Modify |
| `tests/unit/exporters/manifest.test.ts` | README content tests | Modify |
| `CLAUDE.md` | "Cable holes" section + spec list + test count | Modify |

Tasks 1–7 below execute in order. Build stays green between tasks (Task 1 includes the worker-client transport plumbing so we don't repeat the back-cavity Task 1 → Task 2 build break).

---

## Task 1: Parameters, persistence, validation, transport plumbing

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `src/geometry/worker-client.ts`
- Modify: `src/ui/ExportButtons.tsx`
- Test: `tests/unit/state/parameters.test.ts`
- Test: `tests/unit/state/persistence.test.ts`
- Test: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Add parameter-default tests**

Open `tests/unit/state/parameters.test.ts`. Inside the existing `it("starts with defaults", ...)` block, append these expectations after the existing `expect(state.backCavityDepth).toBe(20)` line:

```ts
    expect(state.cableHoleDiameter).toBe(0);
    expect(state.cableHoleY).toBe(100); // letterHeight / 2
    expect(state.cableHoleZ).toBe(10);  // backCavityDepth / 2
    expect(state.cableHoleAtEnds).toBe(true);
```

- [ ] **Step 2: Run failing parameters test**

Run: `npm test -- tests/unit/state/parameters.test.ts`
Expected: FAIL — properties don't exist on `state`.

- [ ] **Step 3: Add fields to `Parameters`, defaults, and `DEFAULT_BACK_CAVITY_DEPTH`**

Edit `src/state/parameters.ts`. Replace the file contents with:

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
  cableHoleDiameter: number;
  cableHoleY: number;
  cableHoleZ: number;
  cableHoleAtEnds: boolean;
};

const DEFAULT_LETTER_HEIGHT = 200;
export const DEFAULT_BACK_CAVITY_DEPTH = 20;

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
  backCavityDepth: DEFAULT_BACK_CAVITY_DEPTH,
  cableHoleDiameter: 0,
  cableHoleY: DEFAULT_LETTER_HEIGHT / 2,
  cableHoleZ: DEFAULT_BACK_CAVITY_DEPTH / 2,
  cableHoleAtEnds: true,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
```

- [ ] **Step 4: Confirm parameters test passes (and TypeScript flags downstream gaps)**

Run: `npm test -- tests/unit/state/parameters.test.ts`
Expected: PASS for the parameters test. Other tests may now fail to compile because `Parameters` is missing fields in their fixtures — that's the intended driver for steps below.

- [ ] **Step 5: Add persistence migration tests**

Open `tests/unit/state/persistence.test.ts`. Append the following `it` blocks inside the `describe("persistence migrate", ...)` block, after the existing `backCavityDepth` tests:

```ts
  it("fills cableHoleDiameter default when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.cableHoleDiameter).toBe(0);
  });

  it("preserves an existing cableHoleDiameter value (including the default 0)", () => {
    const out = migrate({ letterHeight: 200, cableHoleDiameter: 8 });
    expect(out.cableHoleDiameter).toBe(8);
    const zero = migrate({ letterHeight: 200, cableHoleDiameter: 0 });
    expect(zero.cableHoleDiameter).toBe(0);
  });

  it("fills cableHoleY from letterHeight / 2 when missing", () => {
    const out = migrate({ letterHeight: 80 });
    expect(out.cableHoleY).toBe(40);
  });

  it("falls back to default letterHeight / 2 for cableHoleY when both are missing", () => {
    const out = migrate({});
    expect(out.cableHoleY).toBe(100);
  });

  it("preserves an explicit cableHoleY", () => {
    const out = migrate({ letterHeight: 200, cableHoleY: 25 });
    expect(out.cableHoleY).toBe(25);
  });

  it("fills cableHoleZ from backCavityDepth / 2 when missing", () => {
    const out = migrate({ letterHeight: 200, backCavityDepth: 30 });
    expect(out.cableHoleZ).toBe(15);
  });

  it("falls back to default backCavityDepth / 2 for cableHoleZ when both are missing", () => {
    const out = migrate({});
    expect(out.cableHoleZ).toBe(10);
  });

  it("preserves an explicit cableHoleZ", () => {
    const out = migrate({ letterHeight: 200, cableHoleZ: 5 });
    expect(out.cableHoleZ).toBe(5);
  });

  it("fills cableHoleAtEnds default (true) when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.cableHoleAtEnds).toBe(true);
  });

  it("preserves cableHoleAtEnds: false (falsy boolean)", () => {
    const out = migrate({ letterHeight: 200, cableHoleAtEnds: false });
    expect(out.cableHoleAtEnds).toBe(false);
  });
```

- [ ] **Step 6: Run failing persistence tests**

Run: `npm test -- tests/unit/state/persistence.test.ts`
Expected: FAIL — `migrate()` doesn't fill the new fields yet.

- [ ] **Step 7: Update `migrate()` and `ser`**

Edit `src/state/persistence.ts`. Inside `migrate()`, after the existing `backCavityDepth` block, add:

```ts
  if (typeof out.cableHoleDiameter !== "number") {
    out.cableHoleDiameter = DEFAULT_PARAMETERS.cableHoleDiameter;
  }
  if (typeof out.cableHoleY !== "number") {
    const lh = typeof out.letterHeight === "number" ? out.letterHeight : DEFAULT_PARAMETERS.letterHeight;
    out.cableHoleY = lh / 2;
  }
  if (typeof out.cableHoleZ !== "number") {
    const bcd = typeof out.backCavityDepth === "number" ? out.backCavityDepth : DEFAULT_PARAMETERS.backCavityDepth;
    out.cableHoleZ = bcd / 2;
  }
  if (typeof out.cableHoleAtEnds !== "boolean") {
    out.cableHoleAtEnds = DEFAULT_PARAMETERS.cableHoleAtEnds;
  }
```

Then update the `ser` literal in `initPersistence`. Replace the existing `ser` block with:

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
      cableHoleDiameter: state.cableHoleDiameter,
      cableHoleY: state.cableHoleY,
      cableHoleZ: state.cableHoleZ,
      cableHoleAtEnds: state.cableHoleAtEnds,
    };
```

- [ ] **Step 8: Confirm persistence tests pass**

Run: `npm test -- tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 9: Add validation tests**

Open `tests/unit/geometry/validate.test.ts`. Append a new `describe` block at the end of the file:

```ts
describe("cableHole bounds", () => {
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
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
  };

  it("accepts the disabled default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts an enabled diameter with sensible Y/Z", () => {
    expect(validate({ ...base, cableHoleDiameter: 8 }).ok).toBe(true);
  });

  it("rejects negative cableHoleDiameter", () => {
    expect(validate({ ...base, cableHoleDiameter: -1 }).ok).toBe(false);
  });

  it("rejects non-finite cableHoleDiameter / Y / Z", () => {
    expect(validate({ ...base, cableHoleDiameter: NaN }).ok).toBe(false);
    expect(validate({ ...base, cableHoleY: NaN }).ok).toBe(false);
    expect(validate({ ...base, cableHoleZ: NaN }).ok).toBe(false);
  });

  it("accepts arbitrary finite cableHoleY / Z (no upper bounds)", () => {
    expect(validate({ ...base, cableHoleY: -200, cableHoleZ: 500 }).ok).toBe(true);
  });
});
```

Also add a fixture-completeness change: each existing `base` literal in `validate.test.ts` (the ones inside `describe("connected-letters bounds", ...)`, `describe("plexiTolerance bounds", ...)`, and `describe("backCavityDepth bounds", ...)`) is missing the four new fields. Append to each `base` literal:

```ts
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
```

- [ ] **Step 10: Run failing validate tests**

Run: `npm test -- tests/unit/geometry/validate.test.ts`
Expected: The new "rejects negative cableHoleDiameter" / "rejects non-finite" tests FAIL because `validate()` doesn't check them yet. Other tests should compile after the fixture additions.

- [ ] **Step 11: Add validation rules**

Edit `src/geometry/validate.ts`. After the `backCavityDepth` block (inside the `validate` function), add:

```ts
  if (!Number.isFinite(p.cableHoleDiameter) || p.cableHoleDiameter < 0) {
    errors.push({ field: "cableHoleDiameter", message: "Cable hole diameter must be ≥ 0" });
  }
  if (!Number.isFinite(p.cableHoleY)) {
    errors.push({ field: "cableHoleY", message: "Cable hole Y must be a finite number" });
  }
  if (!Number.isFinite(p.cableHoleZ)) {
    errors.push({ field: "cableHoleZ", message: "Cable hole Z must be a finite number" });
  }
```

- [ ] **Step 12: Confirm validate tests pass**

Run: `npm test -- tests/unit/geometry/validate.test.ts`
Expected: PASS.

- [ ] **Step 13: Update `worker-client.ts` `plainParams` literal**

Edit `src/geometry/worker-client.ts`. Replace the existing `plainParams` block (currently 16 lines starting with `const plainParams: Parameters = {`) with:

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
    cableHoleDiameter: params.cableHoleDiameter,
    cableHoleY: params.cableHoleY,
    cableHoleZ: params.cableHoleZ,
    cableHoleAtEnds: params.cableHoleAtEnds,
  };
```

- [ ] **Step 14: Update `ExportButtons.tsx` `serializable` literal**

Edit `src/ui/ExportButtons.tsx`. Replace the existing `serializable` block in `buildReproduceUrl` with:

```ts
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
    cableHoleDiameter: params.cableHoleDiameter,
    cableHoleY: params.cableHoleY,
    cableHoleZ: params.cableHoleZ,
    cableHoleAtEnds: params.cableHoleAtEnds,
  };
```

- [ ] **Step 15: Run full test suite + build**

Run: `npm test`
Expected: PASS (102 tests + the new ones from this task).

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 16: Commit**

```bash
git add src/state/parameters.ts src/state/persistence.ts src/geometry/validate.ts \
  src/geometry/worker-client.ts src/ui/ExportButtons.tsx \
  tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
  tests/unit/geometry/validate.test.ts
git commit -m "$(cat <<'EOF'
feat(cable-holes): add parameters, persistence, validation, transport plumbing

Adds cableHoleDiameter / cableHoleY / cableHoleZ / cableHoleAtEnds to
Parameters with defaults, migration, validation, and reproduce-URL
serialization. Diameter defaults to 0 (feature disabled), so geometry
output is unchanged.
EOF
)"
```

---

## Task 2: Cable hole helper

**Files:**
- Create: `src/geometry/cable-holes.ts`
- Test: `tests/unit/geometry/cable-holes.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/unit/geometry/cable-holes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCableHoles } from "../../../src/geometry/cable-holes";
import type { CableHoleLayoutInput } from "../../../src/geometry/cable-holes";
import type { GlyphContours } from "../../../src/geometry/types";

// Helper: square-shape contours, 50 wide × 200 tall, in glyph-local coords.
const SQUARE: GlyphContours = [
  [[0, 0], [50, 0], [50, 200], [0, 200]],
];

const baseParams = {
  cableHoleDiameter: 8,
  cableHoleY: 100,
  cableHoleZ: 10,
  cableHoleAtEnds: true,
  wallThickness: 5,
};

describe("computeCableHoles", () => {
  it("returns [] when diameter is 0 (feature disabled)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleDiameter: 0 });
    expect(out).toEqual([]);
  });

  it("returns [] when layout is empty", () => {
    const out = computeCableHoles([], new Map(), baseParams);
    expect(out).toEqual([]);
  });

  it("emits a single boundary cylinder between two adjacent letters (atEnds=false)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 }, // letter 1 left edge in word space = 60
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    // letter 0 right edge: 0 + 50 = 50; letter 1 left edge: 60 + 0 = 60; gap = 10.
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(55); // midpoint of 50 and 60
    expect(out[0].y).toBe(100);
    expect(out[0].z).toBe(10);
    expect(out[0].diameter).toBe(8);
    // length = max(|gap| + 4*wallThickness, 4*wallThickness) = max(30, 20) = 30
    expect(out[0].length).toBe(30);
  });

  it("skips boundary across a space (originalIndex gap > 1)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 2, xOffset: 100 }, // index 1 was a space; not in the layout
    ];
    const contours = new Map([[0, SQUARE], [2, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toEqual([]);
  });

  it("emits power-entry cylinders at outer ends when atEnds=true", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams); // atEnds: true
    // 1 boundary + 2 power-entries = 3 cylinders.
    expect(out).toHaveLength(3);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    // power-entry left (xOffset 0 + minX 0 = 0), boundary midpoint (55), power-entry right (xOffset 60 + maxX 50 = 110)
    expect(xs).toEqual([0, 55, 110]);
    // power-entry cylinders use length = 4 * wallThickness = 20.
    const ends = out.filter((h) => h.x === 0 || h.x === 110);
    expect(ends.every((h) => h.length === 20)).toBe(true);
  });

  it("single-letter input with atEnds=true emits two cylinders (both walls)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
    ];
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams);
    expect(out).toHaveLength(2);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 50]); // left wall and right wall of the only letter
  });

  it("single-letter input with atEnds=false emits no cylinders", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
    ];
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toEqual([]);
  });

  it("clamps cylinder length to a minimum of 4 * wallThickness (overlap case)", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 30 }, // overlap: letter 0 ends at 50, letter 1 starts at 30; gap = -20
    ];
    const contours = new Map([[0, SQUARE], [1, SQUARE]]);
    const out = computeCableHoles(layout, contours, { ...baseParams, cableHoleAtEnds: false });
    expect(out).toHaveLength(1);
    // |gap| + 4*wallThickness = 20 + 20 = 40
    expect(out[0].length).toBe(40);
    // midpoint of letter 0 right edge (50) and letter 1 left edge (30) = 40
    expect(out[0].x).toBe(40);
  });

  it("skips entries whose contour map has no entry", () => {
    const layout: CableHoleLayoutInput[] = [
      { originalIndex: 0, xOffset: 0 },
      { originalIndex: 1, xOffset: 60 },
    ];
    // Only contour for index 0; index 1 is missing.
    const contours = new Map([[0, SQUARE]]);
    const out = computeCableHoles(layout, contours, baseParams);
    // No boundary emitted (index 1 has no bbox); only power-entry on index 0 (both walls, since it's effectively the only letter with a bbox).
    expect(out).toHaveLength(2);
    const xs = out.map((h) => h.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 50]);
  });
});
```

- [ ] **Step 2: Run failing helper tests**

Run: `npm test -- tests/unit/geometry/cable-holes.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/geometry/cable-holes.ts`:

```ts
import type { GlyphContours } from "./types";

export type CableHole = {
  x: number;
  y: number;
  z: number;
  diameter: number;
  length: number;
};

// Structural sub-type of LayoutEntry — we only need these two fields.
// Lets tests construct fixture layouts without depending on opentype.Glyph.
export type CableHoleLayoutInput = {
  originalIndex: number;
  xOffset: number;
};

export type CableHoleParams = {
  cableHoleDiameter: number;
  cableHoleY: number;
  cableHoleZ: number;
  cableHoleAtEnds: boolean;
  wallThickness: number;
};

type Bbox = { minX: number; maxX: number };

export function computeCableHoles(
  layout: CableHoleLayoutInput[],
  glyphContours: Map<number, GlyphContours>,
  params: CableHoleParams,
): CableHole[] {
  if (params.cableHoleDiameter <= 0) return [];
  if (layout.length === 0) return [];

  // Per-entry word-space X bbox. null when the contour map has no entry.
  const bboxes: (Bbox | null)[] = layout.map((entry) => {
    const contours = glyphContours.get(entry.originalIndex);
    if (!contours || contours.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const poly of contours) {
      for (const [x] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    return { minX: minX + entry.xOffset, maxX: maxX + entry.xOffset };
  });

  const holes: CableHole[] = [];
  const yzd = {
    y: params.cableHoleY,
    z: params.cableHoleZ,
    diameter: params.cableHoleDiameter,
  };
  const wt = params.wallThickness;

  // Internal boundary cylinders between adjacent non-space letter pairs.
  for (let i = 0; i + 1 < layout.length; i++) {
    if (layout[i + 1].originalIndex - layout[i].originalIndex !== 1) continue;
    const a = bboxes[i];
    const b = bboxes[i + 1];
    if (!a || !b) continue;
    const gap = b.minX - a.maxX;
    const x = (a.maxX + b.minX) / 2;
    const length = Math.max(Math.abs(gap) + 4 * wt, 4 * wt);
    holes.push({ x, ...yzd, length });
  }

  // Power-entry cylinders at the outer ends.
  if (params.cableHoleAtEnds) {
    const valid = bboxes.filter((b): b is Bbox => b !== null);
    if (valid.length > 0) {
      const first = valid[0];
      const last = valid[valid.length - 1];
      const endLength = 4 * wt;
      holes.push({ x: first.minX, ...yzd, length: endLength });
      holes.push({ x: last.maxX, ...yzd, length: endLength });
    }
  }

  return holes;
}
```

- [ ] **Step 4: Confirm helper tests pass**

Run: `npm test -- tests/unit/geometry/cable-holes.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/cable-holes.ts tests/unit/geometry/cable-holes.test.ts
git commit -m "$(cat <<'EOF'
feat(cable-holes): pure helper computing cylinder specs from layout

Adds src/geometry/cable-holes.ts with computeCableHoles(), a pure
function that takes the layout, per-glyph contour map, and parameters,
and returns the list of horizontal cylinders to drill in word space.
Boundary cylinders use the same adjacency rule as bridges; power-entry
cylinders sit at the leftmost/rightmost letters' outer walls when
cableHoleAtEnds is true.
EOF
)"
```

---

## Task 3: Shell drilling

**Files:**
- Modify: `src/geometry/shell.ts`
- Test: `tests/unit/geometry/shell.test.ts`

- [ ] **Step 1: Add shell drilling tests**

Open `tests/unit/geometry/shell.test.ts`. Append a new `describe` block at the end:

```ts
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
```

- [ ] **Step 2: Run failing shell tests**

Run: `npm test -- tests/unit/geometry/shell.test.ts`
Expected: FAIL — `cableHoles` is not a valid `ShellInputs` field; test compilation/runtime errors.

- [ ] **Step 3: Extend `ShellInputs` and add the subtract loop**

Edit `src/geometry/shell.ts`. Update the `ShellInputs` type and `buildLetterShell` to add the new optional field and drilling step.

Replace the `ShellInputs` type (preserve the existing inline comments):

```ts
export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  insetWidth: number; // shelf width where the plexi rests; lip = wallThickness − insetWidth
  backCavityDepth: number; // hollow cavity behind the back panel; 0 = today's flat-back behavior
  cableHoles?: ReadonlyArray<{
    x: number;
    y: number;
    z: number;
    diameter: number;
    length: number;
  }>;
};
```

Inside `buildLetterShell`, locate the conditional rear-cavity block (the `if (input.backCavityDepth > 0) { ... } else { shell = shellNoRear; }` block) and the subsequent `const mesh = shell.getMesh();` line. Insert the new drill loop **between** the closing brace of the `else` branch and `const mesh = shell.getMesh();`:

```ts
  if (input.cableHoles && input.cableHoles.length > 0) {
    const { Manifold } = m;
    for (const hole of input.cableHoles) {
      if (hole.diameter <= 0) continue;
      // Z-cylinder centered at origin: length high, radius = diameter/2,
      // both end-caps with the same radius, default circular segments,
      // centered=true so it spans -length/2 to +length/2 along Z.
      const cyl = Manifold.cylinder(hole.length, hole.diameter / 2, hole.diameter / 2, undefined, true);
      // Rotate 90° around Y axis to align the cylinder axis with the X axis.
      const cylX = cyl.rotate([0, 90, 0]);
      const cylPositioned = cylX.translate([hole.x, hole.y, hole.z]);
      const newShell = shell.subtract(cylPositioned);
      cyl.delete();
      cylX.delete();
      cylPositioned.delete();
      shell.delete();
      shell = newShell;
    }
  }
```

Note: the existing code uses `let shell;` (untyped). The new `let newShell` reassigns it. Keep the rest of the function (mesh extraction, copy, cleanup) as-is — `shell.delete()` at the bottom now refers to whatever the loop's last assignment produced.

- [ ] **Step 4: Confirm shell tests pass**

Run: `npm test -- tests/unit/geometry/shell.test.ts`
Expected: PASS (existing tests + 4 new ones).

If `Manifold.cylinder(...)` throws or doesn't exist on the runtime API, fall back to `CrossSection.circle(hole.diameter / 2).extrude(hole.length).translate([0, 0, -hole.length / 2])` to build the equivalent Z-cylinder, with corresponding `.delete()` calls for each intermediate. The rest of the loop body is unchanged.

- [ ] **Step 5: Run full test suite + build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/shell.ts tests/unit/geometry/shell.test.ts
git commit -m "$(cat <<'EOF'
feat(cable-holes): drill cylindrical holes through the shell

Extends ShellInputs with optional cableHoles and adds a subtraction
loop in buildLetterShell. Each cylinder is built along Z, rotated 90°
to align with X, translated into word space, and subtracted from the
shell. Manifold cleanup matches CLAUDE.md's WASM lifecycle rule.
EOF
)"
```

---

## Task 4: Worker integration

**Files:**
- Modify: `src/geometry/worker.ts`

- [ ] **Step 1: Wire `computeCableHoles` into the worker**

Edit `src/geometry/worker.ts`. Add the import at the top of the imports block:

```ts
import { computeCableHoles } from "./cable-holes";
```

After the existing `mergeIntoComponents` call (the `const merged = await mergeIntoComponents(...)` block), insert:

```ts
  const allCableHoles = computeCableHoles(layout, contoursByIndex, {
    cableHoleDiameter: req.params.cableHoleDiameter,
    cableHoleY: req.params.cableHoleY,
    cableHoleZ: req.params.cableHoleZ,
    cableHoleAtEnds: req.params.cableHoleAtEnds,
    wallThickness: req.params.wallThickness,
  });
```

Inside the `for (const comp of merged.components)` loop, after `const memberRefs = ...` and before the `buildLetterShell` call, add:

```ts
    const componentCableHoles = allCableHoles.filter((h) => {
      const holeMinX = h.x - h.length / 2;
      const holeMaxX = h.x + h.length / 2;
      return holeMaxX >= comp.bbox.minX && holeMinX <= comp.bbox.maxX;
    });
```

Then update the `buildLetterShell` call to pass `cableHoles: componentCableHoles`. The full call becomes:

```ts
    const meshResult = await buildLetterShell({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
      backCavityDepth: req.params.backCavityDepth,
      cableHoles: componentCableHoles,
    });
```

- [ ] **Step 2: Run full test suite + build**

Run: `npm test`
Expected: PASS — worker is exercised indirectly via shell tests; no new direct tests.

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/worker.ts
git commit -m "$(cat <<'EOF'
feat(cable-holes): wire helper into the worker pipeline

Worker calls computeCableHoles once per build, then per-component
filters by X-bbox overlap and passes the filtered list to
buildLetterShell. Components whose bbox doesn't overlap any cylinder
get an empty list (no-op).
EOF
)"
```

---

## Task 5: README

**Files:**
- Modify: `src/exporters/manifest.ts`
- Test: `tests/unit/exporters/manifest.test.ts`

- [ ] **Step 1: Add README content tests**

Open `tests/unit/exporters/manifest.test.ts`. Append a new `it` block at the end of the `describe("buildReadme", ...)` block:

```ts
  it("includes cable hole parameters in the parameter dump", () => {
    const txt = buildReadme(
      {
        ...DEFAULT_PARAMETERS,
        cableHoleDiameter: 8,
        cableHoleY: 75,
        cableHoleZ: 10,
        cableHoleAtEnds: false,
      },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Cable hole dia:    8 mm");
    expect(txt).toContain("Cable hole Y:      75 mm");
    expect(txt).toContain("Cable hole Z:      10 mm");
    expect(txt).toContain("Cable hole ends:   no");
  });

  it("renders cable-hole-ends as 'yes' when true", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, cableHoleAtEnds: true },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Cable hole ends:   yes");
  });
```

- [ ] **Step 2: Run failing manifest tests**

Run: `npm test -- tests/unit/exporters/manifest.test.ts`
Expected: FAIL — README does not yet emit the new lines.

- [ ] **Step 3: Add README lines**

Edit `src/exporters/manifest.ts`. Inside the `lines` array, after the `Back cavity depth:` line, insert four new lines:

```ts
    `  Back cavity depth: ${params.backCavityDepth} mm`,
    `  Cable hole dia:    ${params.cableHoleDiameter} mm`,
    `  Cable hole Y:      ${params.cableHoleY} mm`,
    `  Cable hole Z:      ${params.cableHoleZ} mm`,
    `  Cable hole ends:   ${params.cableHoleAtEnds ? "yes" : "no"}`,
```

Verify column alignment: each label + spaces totals 19 characters before the value (matching the existing pattern). The four new labels are 15, 13, 13, 16 chars; trailing spaces are 4, 6, 6, 3 respectively to bring each to 19.

- [ ] **Step 4: Confirm manifest tests pass**

Run: `npm test -- tests/unit/exporters/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite + build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/exporters/manifest.ts tests/unit/exporters/manifest.test.ts
git commit -m "$(cat <<'EOF'
feat(cable-holes): include cable hole params in the README

Adds four new lines to the parameter dump: cable hole diameter, Y, Z,
and the at-ends toggle (rendered as yes/no). Column alignment matches
the existing 19-char label-plus-padding pattern.
EOF
)"
```

---

## Task 6: UI controls

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Add the "Cable holes" fieldset**

Edit `src/ui/ControlsPanel.tsx`. Locate the existing `<fieldset>` whose `<legend>` is `Connectors` (the `Letter overlap` / `Bridge width` / `Bridge height` / `Bridge Y` block, around lines 118–152). Immediately after that closing `</fieldset>`, before `<details>`, insert:

```tsx
      <fieldset>
        <legend>Cable holes</legend>
        <NumberField
          label="Cable hole diameter"
          unit="mm"
          value={params.cableHoleDiameter}
          onChange={(v) => params.set({ cableHoleDiameter: v })}
          error={errorFor(errs, "cableHoleDiameter")}
          step={0.5}
        />
        <NumberField
          label="Cable hole Y"
          unit="mm"
          value={params.cableHoleY}
          onChange={(v) => params.set({ cableHoleY: v })}
          error={errorFor(errs, "cableHoleY")}
          step={1}
        />
        <NumberField
          label="Cable hole Z"
          unit="mm"
          value={params.cableHoleZ}
          onChange={(v) => params.set({ cableHoleZ: v })}
          error={errorFor(errs, "cableHoleZ")}
          step={1}
        />
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={params.cableHoleAtEnds}
            onChange={(e) => params.set({ cableHoleAtEnds: e.target.checked })}
          />
          Power-entry holes on outer ends
        </label>
      </fieldset>
```

(Reuse `checkbox-field` class — the same one the existing `CameraHUDToggle` and `PlexiToggle` use.)

- [ ] **Step 2: Manually verify UI renders**

Run: `npm run dev`
Open `http://localhost:5173`. The "Cable holes" fieldset should appear between "Connectors" and "Advanced", with three NumberFields and one checkbox. Increase `Cable hole diameter` to 8 mm; the preview should regenerate with cable holes drilled at the boundaries between the default `BURGER` letters. Confirm power-entry holes appear at B's left wall and R's right wall when the checkbox is on; confirm they disappear when off.

Stop the dev server (`Ctrl-C`).

- [ ] **Step 3: Run full test suite + build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ControlsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(cable-holes): UI fieldset with diameter / Y / Z / at-ends

Adds a "Cable holes" fieldset to ControlsPanel between Connectors and
Advanced. Three NumberFields (diameter, Y, Z) and one checkbox for
power-entry-at-ends. Diameter defaults to 0 (disabled).
EOF
)"
```

---

## Task 7: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the "Cable holes" section**

Edit `CLAUDE.md`. After the "Back cavity" section, before the "NumberField behaviour" section, insert:

```md
## Cable holes

`cableHoleDiameter`, `cableHoleY`, `cableHoleZ`, `cableHoleAtEnds` (in `state/parameters.ts`) drive the cable-hole drilling step. Default `cableHoleDiameter = 0` disables the feature; geometry is unchanged.

`src/geometry/cable-holes.ts` is a pure helper: given the layout, the per-glyph contour map, and the parameters, it returns a list of horizontal cylinder specs in word space. Boundary cylinders sit between every adjacent non-space letter pair (same `b.index - a.index === 1` rule as bridges); power-entry cylinders sit at the leftmost letter's left edge and the rightmost letter's right edge when `cableHoleAtEnds = true`.

Boundary cylinder length = `max(|gap| + 4·wallThickness, 4·wallThickness)` — enough margin to fully pierce both adjacent walls without normally reaching the opposite walls of those letters. Power-entry length = `4·wallThickness`. Very thin letters (narrow stems) may get pierced all the way through; that's acceptable for a cable channel.

`worker.ts` calls `computeCableHoles` once per build and per-component filters by X-bbox overlap before passing the filtered list to `buildLetterShell`. For separate components, a single boundary cylinder gets passed to BOTH adjacent components (each carves its own wall). For merged components (overlap or bridges), the same cylinder gets passed to the single merged component (carves a tunnel through the joining material).

`shell.ts`'s drill loop builds a Z-cylinder, rotates 90° around Y to align with X, translates to (x, y, z), and subtracts. Every intermediate Manifold is `.delete()`-ed inline.

If a bridge sits at the same Y/Z as a cable hole, the cylinder pierces the bridge bar (cable runs through it). No special-casing.
```

- [ ] **Step 2: Add the spec reference**

In the "Spec / plan" section near the end of `CLAUDE.md`, after the "Back-cavity feature spec" line, add:

```md
- Cable-holes feature spec: `docs/superpowers/specs/2026-06-10-cable-holes-design.md` (current with code).
```

- [ ] **Step 3: Update the test count**

In the "Tests" section, find the line `- 102 Vitest unit tests, …`. Update the count to reflect the additions from this work. Count actual tests after Task 6 with:

```bash
npm test -- --reporter=verbose 2>&1 | grep -c "✓"
```

Replace `102` with the new total.

- [ ] **Step 4: Verify CLAUDE.md is internally consistent**

Read the modified `CLAUDE.md` start to finish. Check:
- The "Plexi/rabbet semantics" section still accurately describes today's behavior.
- The "Connected mode" section doesn't claim cable holes interact with bridges (mention is in the new section).
- The "Coordinate system" bullet still references Z=0 at the open back / Z=top at the front face — unchanged by this work.

If anything reads stale, fix it.

- [ ] **Step 5: Final test + build**

Run: `npm test`
Expected: PASS, with the new test count.

Run: `npm run build`
Expected: clean.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: CLAUDE.md cable-holes section + spec reference

Documents the cable-holes pipeline (helper / worker filter / shell
drill loop), the cylinder-length formula, and the bridge interaction.
Updates the test count.
EOF
)"
```

---

## Acceptance

- All existing unit tests still pass with explicit cable-hole values added where required.
- New `cable-holes.test.ts` passes (9 tests).
- New shell tests pass (4 cable-hole drill cases).
- `npm run build` clean.
- `npm run lint` clean.
- E2E `npm run e2e` continues to pass (cable holes default to disabled, so the smoke test's geometry is unchanged).
- Default-params build downloads geometry identical to today's.
- Setting `cableHoleDiameter = 8` on default text "BURGER" produces visible boundary holes between adjacent letters in the preview, with optional power-entry holes on B's left and R's right when `cableHoleAtEnds = true`.
- The reproduce URL from a build with cable holes enabled, when pasted into a new browser tab, restores exactly the same parameters.
