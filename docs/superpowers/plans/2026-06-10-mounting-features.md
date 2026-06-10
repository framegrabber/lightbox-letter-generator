# Mounting Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut two keyhole slots per component so the user can hang each printed letter on two wall screws — through the back panel for flat-back letters, through partition-attached tabs in the rear cavity for open-back letters.

**Architecture:** A new pure helper `src/geometry/mounts.ts` computes slot positions and tab boxes per component bbox. The worker calls it once per component and passes the resulting `MountPlan` to `buildLetterShell`, which (when active) unions the tabs into the shell, then subtracts each keyhole shape (head cylinder + shank slot) at the partition Z-range. Disabled by default (`mountShankDiameter = 0`), so the existing geometry is unchanged for users who don't opt in.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), manifold-3d (WASM CSG, `Manifold.cylinder` + `Manifold.cube`), Vitest unit tests.

**Spec:** `docs/superpowers/specs/2026-06-10-mounting-features-design.md`

---

## File Structure

| File | Role | Status |
|---|---|---|
| `src/state/parameters.ts` | Three new fields + defaults | Modify |
| `src/state/persistence.ts` | `migrate()` defaults + `ser` literal | Modify |
| `src/geometry/validate.ts` | Bounds checks for new numeric fields | Modify |
| `src/geometry/worker-client.ts` | `plainParams` literal includes new fields | Modify |
| `src/ui/ExportButtons.tsx` | `serializable` includes new fields | Modify |
| `src/ui/usePreviewBuild.ts` | useEffect deps array includes new fields | Modify |
| `src/geometry/mounts.ts` | Pure helper: bbox + params → slots + tabs | Create |
| `src/geometry/shell.ts` | `ShellInputs.mounts?` + tab union + keyhole subtract | Modify |
| `src/geometry/worker.ts` | `computeMounts` per component + pass to shell | Modify |
| `src/exporters/manifest.ts` | README adds 3 lines | Modify |
| `src/ui/ControlsPanel.tsx` | New "Mounting" fieldset | Modify |
| `tests/unit/geometry/mounts.test.ts` | Helper tests | Create |
| `tests/unit/geometry/shell.test.ts` | Mount drilling smoke + no-op | Modify |
| `tests/unit/state/parameters.test.ts` | Default-value assertions | Modify |
| `tests/unit/state/persistence.test.ts` | Migration tests | Modify |
| `tests/unit/geometry/validate.test.ts` | Bounds tests + fixture-completeness | Modify |
| `tests/unit/exporters/manifest.test.ts` | README content tests | Modify |
| `CLAUDE.md` | "Mounting" section + spec list + test count | Modify |

Tasks 1–7 below execute in order. Build stays green between tasks (Task 1 includes the worker-client / ExportButtons / usePreviewBuild plumbing so we don't repeat the cable-holes deps-array regression).

---

## Task 1: Parameters, persistence, validation, transport plumbing

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `src/geometry/worker-client.ts`
- Modify: `src/ui/ExportButtons.tsx`
- Modify: `src/ui/usePreviewBuild.ts`
- Test: `tests/unit/state/parameters.test.ts`
- Test: `tests/unit/state/persistence.test.ts`
- Test: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Add parameter-default tests**

Open `tests/unit/state/parameters.test.ts`. Inside the existing `it("starts with defaults", ...)` block, append these expectations after the existing `expect(state.cableHoleAtEnds).toBe(true)` line:

```ts
    expect(state.mountShankDiameter).toBe(0);
    expect(state.mountSlotY).toBe(150); // letterHeight × 0.75
    expect(state.mountSlotXInset).toBe(20); // wallThickness × 2
```

- [ ] **Step 2: Run failing parameters test**

Run: `npm test -- tests/unit/state/parameters.test.ts`
Expected: FAIL — properties don't exist on `state`.

- [ ] **Step 3: Add fields to `Parameters` and defaults**

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
  mountShankDiameter: number;
  mountSlotY: number;
  mountSlotXInset: number;
};

const DEFAULT_LETTER_HEIGHT = 200;
const DEFAULT_WALL_THICKNESS = 10;
export const DEFAULT_BACK_CAVITY_DEPTH = 20;

export const DEFAULT_PARAMETERS: Parameters = {
  text: "BURGER",
  fontSource: { kind: "bundled", id: "anton" },
  letterHeight: DEFAULT_LETTER_HEIGHT,
  wallThickness: DEFAULT_WALL_THICKNESS,
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
  mountShankDiameter: 0,
  mountSlotY: DEFAULT_LETTER_HEIGHT * 0.75,
  mountSlotXInset: DEFAULT_WALL_THICKNESS * 2,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
```

- [ ] **Step 4: Confirm parameters test passes**

Run: `npm test -- tests/unit/state/parameters.test.ts`
Expected: PASS for the parameters test. Other tests may now fail to compile because `Parameters` is missing fields in their fixtures — that's the intended driver for steps below.

- [ ] **Step 5: Add persistence migration tests**

Open `tests/unit/state/persistence.test.ts`. Append the following `it` blocks inside the `describe("persistence migrate", ...)` block, after the existing cable-hole tests:

```ts
  it("fills mountShankDiameter default when missing", () => {
    const out = migrate({ letterHeight: 200 });
    expect(out.mountShankDiameter).toBe(0);
  });

  it("preserves an existing mountShankDiameter value (including 0)", () => {
    const out = migrate({ letterHeight: 200, mountShankDiameter: 4 });
    expect(out.mountShankDiameter).toBe(4);
    const zero = migrate({ letterHeight: 200, mountShankDiameter: 0 });
    expect(zero.mountShankDiameter).toBe(0);
  });

  it("fills mountSlotY from letterHeight × 0.75 when missing", () => {
    const out = migrate({ letterHeight: 80 });
    expect(out.mountSlotY).toBe(60);
  });

  it("falls back to default letterHeight × 0.75 for mountSlotY when both are missing", () => {
    const out = migrate({});
    expect(out.mountSlotY).toBe(150);
  });

  it("preserves an explicit mountSlotY", () => {
    const out = migrate({ letterHeight: 200, mountSlotY: 25 });
    expect(out.mountSlotY).toBe(25);
  });

  it("fills mountSlotXInset from wallThickness × 2 when missing", () => {
    const out = migrate({ wallThickness: 6 });
    expect(out.mountSlotXInset).toBe(12);
  });

  it("falls back to default wallThickness × 2 for mountSlotXInset when both are missing", () => {
    const out = migrate({});
    expect(out.mountSlotXInset).toBe(20);
  });

  it("preserves an explicit mountSlotXInset", () => {
    const out = migrate({ wallThickness: 10, mountSlotXInset: 30 });
    expect(out.mountSlotXInset).toBe(30);
  });
```

- [ ] **Step 6: Run failing persistence tests**

Run: `npm test -- tests/unit/state/persistence.test.ts`
Expected: FAIL — `migrate()` doesn't fill the new fields yet.

- [ ] **Step 7: Update `migrate()` and `ser`**

Edit `src/state/persistence.ts`. Inside `migrate()`, after the existing `cableHoleAtEnds` block, add:

```ts
  if (typeof out.mountShankDiameter !== "number") {
    out.mountShankDiameter = DEFAULT_PARAMETERS.mountShankDiameter;
  }
  if (typeof out.mountSlotY !== "number") {
    const lh = typeof out.letterHeight === "number" ? out.letterHeight : DEFAULT_PARAMETERS.letterHeight;
    out.mountSlotY = lh * 0.75;
  }
  if (typeof out.mountSlotXInset !== "number") {
    const wt = typeof out.wallThickness === "number" ? out.wallThickness : DEFAULT_PARAMETERS.wallThickness;
    out.mountSlotXInset = wt * 2;
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
      mountShankDiameter: state.mountShankDiameter,
      mountSlotY: state.mountSlotY,
      mountSlotXInset: state.mountSlotXInset,
    };
```

- [ ] **Step 8: Confirm persistence tests pass**

Run: `npm test -- tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 9: Add validation tests**

Open `tests/unit/geometry/validate.test.ts`. Append a new `describe` block at the end of the file:

```ts
describe("mount bounds", () => {
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
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
  };

  it("accepts the disabled default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts an enabled shank diameter with sensible Y/inset", () => {
    expect(validate({ ...base, mountShankDiameter: 4 }).ok).toBe(true);
  });

  it("rejects negative mountShankDiameter", () => {
    expect(validate({ ...base, mountShankDiameter: -1 }).ok).toBe(false);
  });

  it("rejects non-finite mount fields", () => {
    expect(validate({ ...base, mountShankDiameter: NaN }).ok).toBe(false);
    expect(validate({ ...base, mountSlotY: NaN }).ok).toBe(false);
    expect(validate({ ...base, mountSlotXInset: NaN }).ok).toBe(false);
  });

  it("rejects mountSlotXInset = 0", () => {
    expect(validate({ ...base, mountSlotXInset: 0 }).ok).toBe(false);
  });

  it("rejects negative mountSlotXInset", () => {
    expect(validate({ ...base, mountSlotXInset: -5 }).ok).toBe(false);
  });

  it("accepts arbitrary finite mountSlotY (no upper bound)", () => {
    expect(validate({ ...base, mountSlotY: -200 }).ok).toBe(true);
    expect(validate({ ...base, mountSlotY: 9999 }).ok).toBe(true);
  });
});
```

Also add a fixture-completeness change: each existing `base` literal in `validate.test.ts` (the ones inside `describe("connected-letters bounds", ...)`, `describe("plexiTolerance bounds", ...)`, `describe("backCavityDepth bounds", ...)`, and `describe("cableHole bounds", ...)`) is missing the three new fields. Append to each `base` literal:

```ts
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
```

- [ ] **Step 10: Run failing validate tests**

Run: `npm test -- tests/unit/geometry/validate.test.ts`
Expected: The new "rejects" tests FAIL because `validate()` doesn't check the mount fields yet. Other tests should compile after the fixture additions.

- [ ] **Step 11: Add validation rules**

Edit `src/geometry/validate.ts`. After the `cableHoleZ` block (inside the `validate` function, just before the `return` statement), add:

```ts
  if (!Number.isFinite(p.mountShankDiameter) || p.mountShankDiameter < 0) {
    errors.push({ field: "mountShankDiameter", message: "Mount shank diameter must be ≥ 0" });
  }
  if (!Number.isFinite(p.mountSlotY)) {
    errors.push({ field: "mountSlotY", message: "Mount slot Y must be a finite number" });
  }
  if (!Number.isFinite(p.mountSlotXInset) || p.mountSlotXInset <= 0) {
    errors.push({ field: "mountSlotXInset", message: "Mount slot X inset must be > 0" });
  }
```

- [ ] **Step 12: Confirm validate tests pass**

Run: `npm test -- tests/unit/geometry/validate.test.ts`
Expected: PASS.

- [ ] **Step 13: Update `worker-client.ts` `plainParams` literal**

Edit `src/geometry/worker-client.ts`. Locate the existing `plainParams: Parameters = { ... }` literal. Append the three new fields immediately before the closing brace:

```ts
    mountShankDiameter: params.mountShankDiameter,
    mountSlotY: params.mountSlotY,
    mountSlotXInset: params.mountSlotXInset,
```

- [ ] **Step 14: Update `ExportButtons.tsx` `serializable` literal**

Edit `src/ui/ExportButtons.tsx`. Locate the existing `serializable = { ... }` literal in `buildReproduceUrl`. Append the three new fields immediately before the closing brace:

```ts
    mountShankDiameter: params.mountShankDiameter,
    mountSlotY: params.mountSlotY,
    mountSlotXInset: params.mountSlotXInset,
```

- [ ] **Step 15: Update `usePreviewBuild.ts` deps array**

Edit `src/ui/usePreviewBuild.ts`. Locate the useEffect deps array (currently ends with `params.cableHoleAtEnds,`). Append the three new fields:

```ts
    params.mountShankDiameter,
    params.mountSlotY,
    params.mountSlotXInset,
```

The new deps array tail looks like:

```ts
    params.cableHoleZ,
    params.cableHoleAtEnds,
    params.mountShankDiameter,
    params.mountSlotY,
    params.mountSlotXInset,
  ]);
```

Without these, the preview won't rebuild when mount params change (same regression pattern that bit cable holes).

- [ ] **Step 16: Run full test suite + build**

Run: `npm test`
Expected: PASS (existing tests + the new ones from this task).

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 17: Commit**

```bash
git add src/state/parameters.ts src/state/persistence.ts src/geometry/validate.ts \
  src/geometry/worker-client.ts src/ui/ExportButtons.tsx src/ui/usePreviewBuild.ts \
  tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
  tests/unit/geometry/validate.test.ts
git commit -m "$(cat <<'EOF'
feat(mounts): add parameters, persistence, validation, transport plumbing

Adds mountShankDiameter / mountSlotY / mountSlotXInset to Parameters
with defaults, migration, validation, reproduce-URL serialization, and
the preview deps array. Shank diameter defaults to 0 (feature
disabled), so geometry output is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Mounts helper

**Files:**
- Create: `src/geometry/mounts.ts`
- Test: `tests/unit/geometry/mounts.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/unit/geometry/mounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeMounts } from "../../../src/geometry/mounts";

const baseBBox = { minX: 0, maxX: 100, minY: 0, maxY: 200 };

const baseParams = {
  mountShankDiameter: 4,
  mountSlotY: 150,
  mountSlotXInset: 20,
  wallThickness: 5,
  backThickness: 2,
  backCavityDepth: 20,
};

describe("computeMounts", () => {
  it("returns empty plan when shank diameter is 0 (feature disabled)", () => {
    const out = computeMounts(baseBBox, { ...baseParams, mountShankDiameter: 0 });
    expect(out.slots).toEqual([]);
    expect(out.tabs).toEqual([]);
  });

  it("emits two slots at bbox.minX + xInset and bbox.maxX - xInset", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.slots).toHaveLength(2);
    const xs = out.slots.map((s) => s.x).sort((a, b) => a - b);
    expect(xs).toEqual([20, 80]);
    // both at the same Y
    expect(out.slots.every((s) => s.y === 150)).toBe(true);
  });

  it("derives headDiameter = 2 × shank and slotLength = 4 × shank", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.slots[0].shankDiameter).toBe(4);
    expect(out.slots[0].headDiameter).toBe(8);
    expect(out.slots[0].slotLength).toBe(16);
  });

  it("returns empty tabs when backCavityDepth = 0 (flat-back)", () => {
    const out = computeMounts(baseBBox, { ...baseParams, backCavityDepth: 0 });
    expect(out.slots).toHaveLength(2);
    expect(out.tabs).toEqual([]);
  });

  it("emits two tabs (one per slot) when backCavityDepth > 0", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.tabs).toHaveLength(2);
  });

  it("tab XY brackets the keyhole shape with 2mm margin", () => {
    const out = computeMounts(baseBBox, baseParams);
    // headDiameter = 8, slotLength = 16, slotY = 150
    // Each tab: width = headDiameter + 4 = 12, height = slotLength + headDiameter + 4 = 28
    // Y range: [slotY − slotLength − headDiameter/2 − 2, slotY + 2] = [128, 152]
    // Left tab X: [20 − 6, 20 + 6] = [14, 26]; right tab X: [80 − 6, 80 + 6] = [74, 86]
    const left = out.tabs.find((t) => t.minX === 14);
    const right = out.tabs.find((t) => t.minX === 74);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (!left || !right) return;
    expect(left.maxX).toBe(26);
    expect(right.maxX).toBe(86);
    expect(left.minY).toBe(128);
    expect(left.maxY).toBe(152);
    expect(right.minY).toBe(128);
    expect(right.maxY).toBe(152);
  });

  it("tab Z range = [backCavityDepth − backThickness, backCavityDepth] for typical sizes", () => {
    const out = computeMounts(baseBBox, baseParams);
    expect(out.tabs[0].zBottom).toBe(18); // 20 − 2
    expect(out.tabs[0].zTop).toBe(20);
  });

  it("clamps tab zBottom at 0 when backCavityDepth < backThickness", () => {
    const out = computeMounts(baseBBox, {
      ...baseParams,
      backCavityDepth: 1,
      backThickness: 2,
    });
    expect(out.tabs[0].zBottom).toBe(0);
    expect(out.tabs[0].zTop).toBe(1);
  });
});
```

- [ ] **Step 2: Run failing helper tests**

Run: `npm test -- tests/unit/geometry/mounts.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/geometry/mounts.ts`:

```ts
export type MountSlot = {
  x: number;
  y: number;
  shankDiameter: number;
  headDiameter: number;
  slotLength: number;
};

export type MountTab = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zBottom: number;
  zTop: number;
};

export type MountPlan = {
  slots: MountSlot[];
  tabs: MountTab[];
};

export type MountParams = {
  mountShankDiameter: number;
  mountSlotY: number;
  mountSlotXInset: number;
  wallThickness: number;
  backThickness: number;
  backCavityDepth: number;
};

export function computeMounts(
  componentBBox: { minX: number; maxX: number; minY: number; maxY: number },
  params: MountParams,
): MountPlan {
  if (params.mountShankDiameter <= 0) {
    return { slots: [], tabs: [] };
  }

  const shank = params.mountShankDiameter;
  const head = 2 * shank;
  const slotLength = 4 * shank;
  const y = params.mountSlotY;

  const slots: MountSlot[] = [
    {
      x: componentBBox.minX + params.mountSlotXInset,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    },
    {
      x: componentBBox.maxX - params.mountSlotXInset,
      y,
      shankDiameter: shank,
      headDiameter: head,
      slotLength,
    },
  ];

  if (params.backCavityDepth <= 0) {
    return { slots, tabs: [] };
  }

  // Tab XY brackets the keyhole shape with a 2mm margin on each side.
  // Keyhole Y extent: [y − slotLength − headDiameter/2, y]
  // Tab X extent per slot: [slot.x − head/2 − 2, slot.x + head/2 + 2]
  // Tab Y extent: [y − slotLength − head/2 − 2, y + 2]
  const halfHead = head / 2;
  const tabMinY = y - slotLength - halfHead - 2;
  const tabMaxY = y + 2;
  const zBottom = Math.max(0, params.backCavityDepth - params.backThickness);
  const zTop = params.backCavityDepth;

  const tabs: MountTab[] = slots.map((s) => ({
    minX: s.x - halfHead - 2,
    maxX: s.x + halfHead + 2,
    minY: tabMinY,
    maxY: tabMaxY,
    zBottom,
    zTop,
  }));

  return { slots, tabs };
}
```

- [ ] **Step 4: Confirm helper tests pass**

Run: `npm test -- tests/unit/geometry/mounts.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/mounts.ts tests/unit/geometry/mounts.test.ts
git commit -m "$(cat <<'EOF'
feat(mounts): pure helper computing slot positions and tab boxes

Adds src/geometry/mounts.ts with computeMounts(), a pure function that
takes a component bbox and mount params and returns a MountPlan. Two
slots per component (left/right), at bbox.minX + xInset and bbox.maxX
− xInset. For open-back letters, also returns tab boxes hosted at the
partition's bottom face, sized to bracket the keyhole shape with 2 mm
margin. Disabled (empty plan) when mountShankDiameter ≤ 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Shell tab union + keyhole subtract

**Files:**
- Modify: `src/geometry/shell.ts`
- Test: `tests/unit/geometry/shell.test.ts`

- [ ] **Step 1: Add shell drilling tests**

Open `tests/unit/geometry/shell.test.ts`. Append a new `describe` block at the end of the file:

```ts
describe("buildLetterShell with mounts", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursForLetter(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  function bboxFromContours(contours: ReturnType<typeof contoursForLetter>) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of contours) {
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY };
  }

  const baseInputs = {
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 5,
    rabbetDepth: 3,
    insetWidth: 3,
    backCavityDepth: 20,
  };

  it("mounts undefined produces the same triangle count as omitting the option", async () => {
    const contours = contoursForLetter("M");
    const a = await buildLetterShell({ ...baseInputs, contours });
    const b = await buildLetterShell({ ...baseInputs, contours, mounts: undefined });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.triVerts.length).toBe(b.mesh.triVerts.length);
  }, 30_000);

  it("an empty MountPlan is a no-op", async () => {
    const contours = contoursForLetter("M");
    const a = await buildLetterShell({ ...baseInputs, contours });
    const b = await buildLetterShell({
      ...baseInputs,
      contours,
      mounts: { slots: [], tabs: [] },
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.triVerts.length).toBe(b.mesh.triVerts.length);
  }, 30_000);

  it("flat-back: keyhole subtract changes triangle count", async () => {
    const contours = contoursForLetter("M");
    const bbox = bboxFromContours(contours);
    const noMounts = await buildLetterShell({
      ...baseInputs,
      contours,
      backCavityDepth: 0,
    });
    expect(noMounts.ok).toBe(true);
    if (!noMounts.ok) return;

    const slot = {
      x: (bbox.minX + bbox.maxX) / 2,
      y: 50,
      shankDiameter: 2,
      headDiameter: 4,
      slotLength: 8,
    };
    const withMounts = await buildLetterShell({
      ...baseInputs,
      contours,
      backCavityDepth: 0,
      mounts: { slots: [slot], tabs: [] },
    });
    expect(withMounts.ok).toBe(true);
    if (!withMounts.ok) return;
    expect(withMounts.mesh.triVerts.length).not.toBe(noMounts.mesh.triVerts.length);
  }, 30_000);

  it("open-back: tabs union plus keyhole subtract produces more triangles than baseline", async () => {
    const contours = contoursForLetter("M");
    const bbox = bboxFromContours(contours);
    const noMounts = await buildLetterShell({ ...baseInputs, contours });
    expect(noMounts.ok).toBe(true);
    if (!noMounts.ok) return;

    const slotX = (bbox.minX + bbox.maxX) / 2;
    const slot = {
      x: slotX,
      y: 50,
      shankDiameter: 2,
      headDiameter: 4,
      slotLength: 8,
    };
    const tab = {
      minX: slotX - 4,
      maxX: slotX + 4,
      minY: 50 - 8 - 2 - 2,
      maxY: 50 + 2,
      zBottom: baseInputs.backCavityDepth - baseInputs.backThickness,
      zTop: baseInputs.backCavityDepth,
    };
    const withMounts = await buildLetterShell({
      ...baseInputs,
      contours,
      mounts: { slots: [slot], tabs: [tab] },
    });
    expect(withMounts.ok).toBe(true);
    if (!withMounts.ok) return;
    expect(withMounts.mesh.triVerts.length).toBeGreaterThan(noMounts.mesh.triVerts.length);
  }, 30_000);
});
```

- [ ] **Step 2: Run failing shell tests**

Run: `npm test -- tests/unit/geometry/shell.test.ts`
Expected: FAIL — `mounts` is not a valid `ShellInputs` field; tests fail to compile.

- [ ] **Step 3: Extend `ShellInputs` and add the union+subtract block**

Edit `src/geometry/shell.ts`. At the top, after the existing `import type { CableHole } from "./cable-holes";` line, add:

```ts
import type { MountPlan } from "./mounts";
```

Update the `ShellInputs` type. Replace the existing type with:

```ts
export type ShellInputs = {
  contours: GlyphContours; // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  insetWidth: number; // shelf width where the plexi rests; lip = wallThickness − insetWidth
  backCavityDepth: number; // hollow cavity behind the back panel; 0 = today's flat-back behavior
  cableHoles?: ReadonlyArray<CableHole>;
  mounts?: MountPlan;
};
```

Inside `buildLetterShell`, locate the existing cable-hole drilling block (the `if (input.cableHoles && input.cableHoles.length > 0) { ... }` block). Insert the new mount block **after** the cable-hole block and **before** `const mesh = shell.getMesh();`:

```ts
  if (input.mounts && (input.mounts.slots.length > 0 || input.mounts.tabs.length > 0)) {
    const { Manifold } = m;

    // 1. UNION tabs (open-back only — flat-back has empty tabs array).
    for (const tab of input.mounts.tabs) {
      const tabSize: [number, number, number] = [
        tab.maxX - tab.minX,
        tab.maxY - tab.minY,
        tab.zTop - tab.zBottom,
      ];
      // Manifold.cube(size, false): one corner at origin, opposite at +size.
      const tabBox = Manifold.cube(tabSize, false);
      const tabPositioned = tabBox.translate([tab.minX, tab.minY, tab.zBottom]);
      const newShell = shell.add(tabPositioned);
      tabBox.delete();
      tabPositioned.delete();
      shell.delete();
      shell = newShell;
    }

    // 2. SUBTRACT keyhole shapes (head cylinder + shank slot box, unioned).
    const keyholeBottom = input.backCavityDepth > 0
      ? Math.max(0, input.backCavityDepth - input.backThickness)
      : 0;
    const keyholeTop = input.backCavityDepth > 0
      ? input.backCavityDepth
      : input.backThickness;
    const keyholeHeight = keyholeTop - keyholeBottom;
    const keyholeCenterZ = (keyholeBottom + keyholeTop) / 2;

    for (const slot of input.mounts.slots) {
      // Round head opening as a Z-cylinder at (slot.x, slot.y − slotLength).
      const head = Manifold.cylinder(
        keyholeHeight,
        slot.headDiameter / 2,
        slot.headDiameter / 2,
        undefined,
        true,
      );
      const headPositioned = head.translate([
        slot.x,
        slot.y - slot.slotLength,
        keyholeCenterZ,
      ]);

      // Narrow shank slot as a rectangular box from (slot.y − slotLength) to slot.y.
      const slotBox = Manifold.cube(
        [slot.shankDiameter, slot.slotLength, keyholeHeight],
        true,
      );
      const slotBoxPositioned = slotBox.translate([
        slot.x,
        slot.y - slot.slotLength / 2,
        keyholeCenterZ,
      ]);

      // Union head + shank slot, then subtract from shell.
      const keyhole = headPositioned.add(slotBoxPositioned);
      const newShell = shell.subtract(keyhole);

      head.delete();
      headPositioned.delete();
      slotBox.delete();
      slotBoxPositioned.delete();
      keyhole.delete();
      shell.delete();
      shell = newShell;
    }
  }
```

This block runs after the existing cable-hole drilling so cable cylinders pass cleanly through any tab they happen to share Z with. Every Manifold intermediate is `.delete()`-ed inline (CLAUDE.md WASM rule).

- [ ] **Step 4: Confirm shell tests pass**

Run: `npm test -- tests/unit/geometry/shell.test.ts`
Expected: PASS (existing tests + 4 new mount cases).

- [ ] **Step 5: Run full test suite + build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/shell.ts tests/unit/geometry/shell.test.ts
git commit -m "$(cat <<'EOF'
feat(mounts): tab union + keyhole subtract in buildLetterShell

Extends ShellInputs with optional mounts: MountPlan and adds a block
in buildLetterShell that runs after cable-hole drilling. For each tab
in the plan, builds a Manifold.cube and unions it into the shell. For
each slot, builds a head cylinder + shank slot box, unions them, and
subtracts the keyhole from the shell. Manifold cleanup matches
CLAUDE.md's WASM lifecycle rule.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Worker integration

**Files:**
- Modify: `src/geometry/worker.ts`

- [ ] **Step 1: Wire `computeMounts` into the worker**

Edit `src/geometry/worker.ts`. Add the import after the existing `import { computeCableHoles } from "./cable-holes";` line:

```ts
import { computeMounts } from "./mounts";
```

Inside the `for (const comp of merged.components)` loop, after the `componentCableHoles` filter (and before the `buildLetterShell` call), add:

```ts
    const componentMounts = computeMounts(comp.bbox, {
      mountShankDiameter: req.params.mountShankDiameter,
      mountSlotY: req.params.mountSlotY,
      mountSlotXInset: req.params.mountSlotXInset,
      wallThickness: req.params.wallThickness,
      backThickness: req.params.backThickness,
      backCavityDepth: req.params.backCavityDepth,
    });
```

Then update the `buildLetterShell` call to pass `mounts`. Replace the existing call with:

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
      mounts: componentMounts.slots.length > 0 ? componentMounts : undefined,
    });
```

The empty-plan check (`slots.length > 0`) means a component whose bbox produced an empty plan (shouldn't happen today, but guards against future changes) skips the no-op shell block entirely.

- [ ] **Step 2: Run full test suite + build**

Run: `npm test`
Expected: PASS — worker is exercised indirectly via shell tests.

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/worker.ts
git commit -m "$(cat <<'EOF'
feat(mounts): wire helper into the worker pipeline

Worker calls computeMounts per component using the merged-component
bbox, then passes the resulting MountPlan to buildLetterShell. Each
component gets its own pair of slots (and tabs, when open-back). For
merged components (overlap or bridges), the merged bbox places slots
near the outer edges of the joined letters.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
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
  it("includes mount parameters in the parameter dump", () => {
    const txt = buildReadme(
      {
        ...DEFAULT_PARAMETERS,
        mountShankDiameter: 4,
        mountSlotY: 150,
        mountSlotXInset: 20,
      },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Mount shank dia:   4 mm");
    expect(txt).toContain("Mount slot Y:      150 mm");
    expect(txt).toContain("Mount slot inset:  20 mm");
  });
```

- [ ] **Step 2: Run failing manifest tests**

Run: `npm test -- tests/unit/exporters/manifest.test.ts`
Expected: FAIL — README does not yet emit the new lines.

- [ ] **Step 3: Add README lines**

Edit `src/exporters/manifest.ts`. Inside the `lines` array, after the `Cable hole ends:` line, insert three new lines:

```ts
    `  Cable hole ends:   ${params.cableHoleAtEnds ? "yes" : "no"}`,
    `  Mount shank dia:   ${params.mountShankDiameter} mm`,
    `  Mount slot Y:      ${params.mountSlotY} mm`,
    `  Mount slot inset:  ${params.mountSlotXInset} mm`,
```

Verify column alignment: each label + spaces totals 19 characters before the value (matching the existing pattern). Labels are 16, 13, 17 chars; trailing spaces are 3, 6, 2 respectively to bring each to 19.

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
feat(mounts): include mount params in the README

Adds three new lines to the parameter dump: mount shank diameter, slot
Y, and slot X inset. Column alignment matches the existing 19-char
label-plus-padding pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: UI controls

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Add the "Mounting" fieldset**

Edit `src/ui/ControlsPanel.tsx`. Locate the existing `<fieldset>` whose `<legend>` is `Cable holes` (the diameter / Y / Z / at-ends block). Immediately after that closing `</fieldset>`, before `<details>`, insert:

```tsx
      <fieldset>
        <legend>Mounting</legend>
        <NumberField
          label="Mount shank diameter"
          unit="mm"
          value={params.mountShankDiameter}
          onChange={(v) => params.set({ mountShankDiameter: v })}
          error={errorFor(errs, "mountShankDiameter")}
          step={0.5}
        />
        <NumberField
          label="Mount slot Y"
          unit="mm"
          value={params.mountSlotY}
          onChange={(v) => params.set({ mountSlotY: v })}
          error={errorFor(errs, "mountSlotY")}
          step={1}
        />
        <NumberField
          label="Mount slot X inset"
          unit="mm"
          value={params.mountSlotXInset}
          onChange={(v) => params.set({ mountSlotXInset: v })}
          error={errorFor(errs, "mountSlotXInset")}
          step={1}
        />
      </fieldset>
```

`step={0.5}` for the diameter (small adjustments matter for screw fit); `step={1}` for placement params.

- [ ] **Step 2: Manually verify UI renders**

Run: `npm run dev`
Open `http://localhost:5173`. The "Mounting" fieldset should appear between "Cable holes" and "Advanced", with three NumberFields. Set `Mount shank diameter` to 4 mm; the preview should regenerate with two keyhole openings near the top of each letter. Toggle `Back cavity depth` to 0 and back to 20 — the keyhole should appear in the back panel for flat-back, and on a tab in the rear cavity for open-back. Try setting `Mount slot Y` very high (e.g., 190) and very low (e.g., 20) — slots should follow.

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
feat(mounts): UI fieldset with shank diameter / slot Y / X inset

Adds a "Mounting" fieldset to ControlsPanel between Cable holes and
Advanced. Three NumberFields: shank diameter (step 0.5), slot Y (step
1), slot X inset (step 1). Shank diameter defaults to 0 (disabled).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the "Mounting" section**

Edit `CLAUDE.md`. After the "Cable holes" section, before the "NumberField behaviour" section, insert:

```md
## Mounting

`mountShankDiameter`, `mountSlotY`, `mountSlotXInset` (in `state/parameters.ts`) drive the keyhole-mount step. Default `mountShankDiameter = 0` disables the feature; geometry is unchanged. `headDiameter = 2 × shank` and `slotLength = 4 × shank` are derived in `mounts.ts` and never stored.

`src/geometry/mounts.ts` is a pure helper: given a component bbox and mount params, it returns a `MountPlan` of two slots (one per side, at `bbox.minX + xInset` / `bbox.maxX − xInset`) and zero or two tabs. Tabs only emerge when `backCavityDepth > 0`; their Z range is `[max(0, backCavityDepth − backThickness), backCavityDepth]` (clamped at 0 for very small back cavities so the tab never protrudes past the open back).

`worker.ts` calls `computeMounts` per component using the merged-component bbox. For separate components, each gets its own pair of slots (and tabs). For merged components (overlap or bridges), the merged bbox places slots near the outer edges of the joined piece.

`shell.ts`'s mount block runs **after** cable-hole drilling: tabs are unioned in via `Manifold.cube` first, then keyholes (head cylinder via `Manifold.cylinder` + shank slot box via `Manifold.cube`, unioned together) are subtracted. The block runs through one Z range — `[0, backThickness]` for flat-back, `[max(0, backCavityDepth − backThickness), backCavityDepth]` for open-back — so the partition stays solid above the keyhole in open-back mode.

Slot orientation: round head opening at the BOTTOM, narrow shank slot extending UPWARD. `mountSlotY` is the Y of the screw's resting position (= top of the slot). The user marks the wall and drills the screws at letter-coord Y = `mountSlotY`.

The tab attaches to the partition's bottom face (Z = `backCavityDepth`) and is sized just to bracket the keyhole shape with 2 mm margin on each side. It does not extend to the perimeter wall — the partition spans the full outer outline at any (X, Y) inside the letter, so the tab fuses with the partition wherever the slot sits inside material.
```

- [ ] **Step 2: Add the spec reference**

In the "Spec / plan" section near the end of `CLAUDE.md`, after the "Cable-holes feature spec" line, add:

```md
- Mounting-features feature spec: `docs/superpowers/specs/2026-06-10-mounting-features-design.md` (current with code).
```

- [ ] **Step 3: Update the test count**

In the "Tests" section, find the line beginning `- 132 Vitest unit tests, …` (or whatever the current number is). Recompute by running:

```bash
npm test 2>&1 | grep -E "^Tests" | tail -1
```

Replace the count in `CLAUDE.md` with the new total.

- [ ] **Step 4: Verify CLAUDE.md is internally consistent**

Read the modified `CLAUDE.md` start to finish. Check:
- The "Coordinate system" bullet still references Z=0 at the open back / Z=top at the front face — unchanged by this work.
- The "Connected mode" section doesn't claim mounts interact with bridges (mention is in the new section).
- The "Cable holes" section doesn't claim it runs after mounts (it runs before — already documented as "no special-casing" for shared Z, which still holds).

If anything reads stale, fix it.

- [ ] **Step 5: Final test + lint + build**

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
docs: CLAUDE.md mounting section + spec reference

Documents the mounting pipeline (helper / worker / shell tab union +
keyhole subtract), slot orientation semantics, and the partition-tab
geometry. Updates the test count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Acceptance

- All existing unit tests still pass with explicit mount values added where required.
- New `mounts.test.ts` passes (8 tests).
- New shell tests pass (4 mount drill cases).
- `npm run build` clean.
- `npm run lint` clean.
- E2E `npm run e2e` continues to pass (mounts default to disabled, so the smoke test's geometry is unchanged).
- Default-params build downloads geometry identical to today's.
- Setting `mountShankDiameter = 4` on default text "BURGER":
  - With `backCavityDepth = 20` (default open-back): each letter has 2 keyhole-shaped cutouts in tabs hanging from the partition into the rear cavity, with the round head opening at the bottom and the slot extending upward to Y = 150.
  - With `backCavityDepth = 0` (flat-back): each letter has 2 keyhole-shaped through-holes in its back panel.
- The reproduce URL from a build with mounts enabled, when pasted into a new browser tab, restores exactly the same parameters.
