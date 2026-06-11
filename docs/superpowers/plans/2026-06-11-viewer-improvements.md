# Viewer Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CAD-style ViewCube widget for orienting the camera and an adaptive labeled grid that doubles as a visual size indicator, both replacing the current plain `<gridHelper>` and the absence of any orientation widget.

**Architecture:** Two new viewer-only features composed in `PreviewCanvas.tsx`, gated by two new `useUI` flags (`showGrid`, `showViewcube`) that follow the existing session-only pattern. A pure helper module `src/ui/grid-spacing.ts` computes adaptive grid spacing from the geometry bbox. A new floating Grid-toggle button stacks alongside the existing Fit button at bottom-left of the canvas.

**Tech Stack:** React 19, TypeScript strict + verbatimModuleSyntax, three.js 0.184, @react-three/fiber 9, @react-three/drei 10.7.7 (`<Grid>`, `<GizmoHelper>`, `<GizmoViewcube>`, `<Text>`, `<Billboard>`), zustand for UI state, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-11-viewer-improvements-design.md`

---

## File Structure

**Created:**
- `src/ui/grid-spacing.ts` — pure `pickGridSpacing` + `componentsBBox` helpers
- `tests/unit/ui/grid-spacing.test.ts` — unit tests for both helpers

**Modified:**
- `src/state/ui.ts` — add `showGrid`, `showViewcube` flags and setters
- `src/ui/PreviewCanvas.tsx` — replace `<gridHelper>` with `<AdaptiveGrid>` + `<AxisTickLabels>` (inline components in this file), add `<GizmoHelper><GizmoViewcube/></GizmoHelper>`, add Grid-toggle button alongside Fit
- `src/ui/styles.css` — `.preview-toolbar`, `.preview-toolbar-button`, `.preview-toolbar-button.active`; shift `.preview-errors` upward to clear the toolbar
- `CLAUDE.md` — new "Viewer" subsection covering the grid + viewcube + Z-up landmine

---

## Task 1: Pure helpers — `pickGridSpacing` and `componentsBBox`

**Files:**
- Create: `src/ui/grid-spacing.ts`
- Test: `tests/unit/ui/grid-spacing.test.ts`

- [ ] **Step 1: Write failing tests for both helpers**

Create `tests/unit/ui/grid-spacing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickGridSpacing, componentsBBox } from "../../../src/ui/grid-spacing";

describe("pickGridSpacing", () => {
  it("returns the default {major: 50, minor: 10} for non-positive or non-finite input", () => {
    expect(pickGridSpacing(0)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(-1)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(NaN)).toEqual({ major: 50, minor: 10 });
    expect(pickGridSpacing(Infinity)).toEqual({ major: 50, minor: 10 });
  });

  it("picks major=10 when bbox max dim is 50 (ideal=10)", () => {
    // ideal = 50 / 5 = 10, smallest NICE_NUMBER >= 10 is 10
    expect(pickGridSpacing(50)).toEqual({ major: 10, minor: 2 });
  });

  it("picks major=50 for the default-letter case (bbox ~200mm)", () => {
    // ideal = 200 / 5 = 40, smallest NICE_NUMBER >= 40 is 50
    expect(pickGridSpacing(200)).toEqual({ major: 50, minor: 10 });
  });

  it("picks major=500 for very large geometry (bbox ~2000mm)", () => {
    // ideal = 2000 / 5 = 400, smallest NICE_NUMBER >= 400 is 500
    expect(pickGridSpacing(2000)).toEqual({ major: 500, minor: 100 });
  });

  it("caps at the largest NICE_NUMBER for pathological input", () => {
    expect(pickGridSpacing(1_000_000)).toEqual({ major: 5000, minor: 1000 });
  });
});

describe("componentsBBox", () => {
  it("returns null for an empty array", () => {
    expect(componentsBBox([])).toBeNull();
  });

  it("shifts a single component's X extent by xOffset and leaves Y unchanged", () => {
    const out = componentsBBox([
      {
        xOffset: 100,
        bbox: { minX: 0, maxX: 50, minY: -10, maxY: 80 },
      },
    ]);
    expect(out).toEqual({ minX: 100, maxX: 150, minY: -10, maxY: 80 });
  });

  it("covers the union of word-space extents across multiple components", () => {
    // Component A: xOffset=0, X extent [0..50], Y [0..100]
    // Component B: xOffset=200, X extent [0..50] in local => [200..250] in world
    const out = componentsBBox([
      { xOffset: 0, bbox: { minX: 0, maxX: 50, minY: 0, maxY: 100 } },
      { xOffset: 200, bbox: { minX: 0, maxX: 50, minY: -20, maxY: 80 } },
    ]);
    expect(out).toEqual({ minX: 0, maxX: 250, minY: -20, maxY: 100 });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/unit/ui/grid-spacing.test.ts`
Expected: FAIL — module not found (`src/ui/grid-spacing.ts` does not exist).

- [ ] **Step 3: Implement `src/ui/grid-spacing.ts`**

Create `src/ui/grid-spacing.ts`:

```ts
export type GridSpacing = { major: number; minor: number };

const NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const TARGET_MAJOR_LINES = 5;
const DEFAULT_SPACING: GridSpacing = { major: 50, minor: 10 };

// Pick a "nice number" major spacing so the geometry's largest horizontal
// dimension spans roughly TARGET_MAJOR_LINES major squares. Minor is always
// major / 5. Falls back to a sensible default for non-positive / non-finite
// input (no geometry yet, NaN, etc.).
export function pickGridSpacing(bboxMaxDim: number): GridSpacing {
  if (!Number.isFinite(bboxMaxDim) || bboxMaxDim <= 0) {
    return DEFAULT_SPACING;
  }
  const ideal = bboxMaxDim / TARGET_MAJOR_LINES;
  const major =
    NICE_NUMBERS.find((n) => n >= ideal) ??
    NICE_NUMBERS[NICE_NUMBERS.length - 1];
  return { major, minor: major / 5 };
}

export type ComponentLike = {
  xOffset: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

// Returns the world-space XY bbox covering every component using each
// component's pre-centering bbox plus its xOffset. The worker stores
// `vertProperties` already centered on the component's own bbox while keeping
// `bbox` (pre-centering, in word space) and `xOffset` (the word-space minX).
// PreviewLetter places the component group at (xOffset + cx, cy), which means
// the world-space X extent is exactly [xOffset + bbox.minX, xOffset + bbox.maxX]
// and the Y extent is [bbox.minY, bbox.maxY]. No vertex walk needed.
export function componentsBBox(
  components: ReadonlyArray<ComponentLike>,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (components.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of components) {
    const wx0 = c.xOffset + c.bbox.minX;
    const wx1 = c.xOffset + c.bbox.maxX;
    if (wx0 < minX) minX = wx0;
    if (wx1 > maxX) maxX = wx1;
    if (c.bbox.minY < minY) minY = c.bbox.minY;
    if (c.bbox.maxY > maxY) maxY = c.bbox.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run tests/unit/ui/grid-spacing.test.ts`
Expected: PASS — 8 tests passing across 2 describes.

- [ ] **Step 5: Run the full unit suite to confirm no regression**

Run: `npm test -- --run`
Expected: all existing tests still pass plus the 8 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/ui/grid-spacing.ts tests/unit/ui/grid-spacing.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): pickGridSpacing + componentsBBox helpers

Pure helpers that drive the upcoming adaptive labeled grid.
pickGridSpacing maps a bbox max dimension to a "nice number" major
spacing (1/2/5/10/20/50/...) targeting ~5 major lines across the
geometry; minor is always major/5. componentsBBox composes the
world-space XY bbox from each component's pre-centering bbox + xOffset
without a vertex walk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `useUI` with `showGrid` and `showViewcube`

**Files:**
- Modify: `src/state/ui.ts`

- [ ] **Step 1: Read the current state file**

Read `src/state/ui.ts`. Confirm the current shape:

```ts
import { create } from "zustand";

type UIState = {
  showCameraHUD: boolean;
  setShowCameraHUD: (v: boolean) => void;
  showPlexi: boolean;
  setShowPlexi: (v: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  showCameraHUD: false,
  setShowCameraHUD: (v) => set({ showCameraHUD: v }),
  showPlexi: true,
  setShowPlexi: (v) => set({ showPlexi: v }),
}));
```

- [ ] **Step 2: Update `src/state/ui.ts` to add the two new flags**

Replace the entire file with:

```ts
import { create } from "zustand";

// Session-only UI state (not persisted to URL/localStorage).
type UIState = {
  showCameraHUD: boolean;
  setShowCameraHUD: (v: boolean) => void;
  showPlexi: boolean;
  setShowPlexi: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showViewcube: boolean;
  setShowViewcube: (v: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  showCameraHUD: false,
  setShowCameraHUD: (v) => set({ showCameraHUD: v }),
  showPlexi: true,
  setShowPlexi: (v) => set({ showPlexi: v }),
  showGrid: true,
  setShowGrid: (v) => set({ showGrid: v }),
  showViewcube: true,
  setShowViewcube: (v) => set({ showViewcube: v }),
}));
```

- [ ] **Step 3: Typecheck the project**

Run: `npx tsc --noEmit`
Expected: clean — no errors. (We don't add tests for this trivial state extension; the type system covers correctness and existing tests still pass.)

- [ ] **Step 4: Run the full unit suite**

Run: `npm test -- --run`
Expected: all tests pass (no behavior change yet for the UI; this just adds dormant flags).

- [ ] **Step 5: Commit**

```bash
git add src/state/ui.ts
git commit -m "$(cat <<'EOF'
feat(state): add showGrid + showViewcube ui flags

Session-only flags following the existing showCameraHUD / showPlexi
pattern. Both default to true. No UI yet wires them — the upcoming
PreviewCanvas changes consume these.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Replace `<gridHelper>` with `<AdaptiveGrid>` + `<AxisTickLabels>`

**Files:**
- Modify: `src/ui/PreviewCanvas.tsx`

- [ ] **Step 1: Read `src/ui/PreviewCanvas.tsx` end-to-end**

Open the file. Note these landmarks:
- Imports: `Canvas`, `useFrame`, `useThree` from `@react-three/fiber`; `OrbitControls` from `@react-three/drei`.
- The current `<gridHelper>` line (around line 126 in the unmodified file).
- The `result` value from `usePreviewBuildContext()` is a `BuildResult | null` (defined in `src/geometry/worker-client.ts`).
- `useUI` is already imported and used for `showCameraHUD`.

- [ ] **Step 2: Update imports at the top of `PreviewCanvas.tsx`**

Find the existing imports and replace with:

```tsx
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Text, Billboard } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useParameters } from "../state/parameters";
import { useUI } from "../state/ui";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { PreviewLetter } from "./PreviewLetter";
import type { BuildResult } from "../geometry/worker-client";
import { pickGridSpacing, componentsBBox } from "./grid-spacing";
```

- [ ] **Step 3: Add `<AdaptiveGrid>` and `<AxisTickLabels>` inline components**

Add these two components ABOVE the existing `function SceneSetup` declaration (so they're in module scope and `SceneSetup` doesn't see them in its closure scope):

```tsx
const MAX_TICKS_PER_DIRECTION = 30;
const LABEL_SCALE_FRACTION = 0.18;

function AdaptiveGrid({ result }: { result: BuildResult | null }) {
  const spacing = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    if (!bbox) return pickGridSpacing(0);
    const dim = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
    return pickGridSpacing(dim);
  }, [result]);

  return (
    <Grid
      args={[10000, 10000]}
      cellSize={spacing.minor}
      sectionSize={spacing.major}
      cellColor="#dcdcdc"
      sectionColor="#9e9e9e"
      cellThickness={0.6}
      sectionThickness={1.0}
      fadeDistance={Math.max(800, spacing.major * 30)}
      fadeStrength={1}
      infiniteGrid
      followCamera={false}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
    />
  );
}

function AxisTickLabels({ result }: { result: BuildResult | null }) {
  const { spacing, range } = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    const dim = bbox
      ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
      : 0;
    const sp = pickGridSpacing(dim);
    const r = Math.min(
      MAX_TICKS_PER_DIRECTION,
      Math.ceil((Math.max(dim, sp.major * 5) * 1.5) / sp.major),
    );
    return { spacing: sp, range: r };
  }, [result]);

  const labels: { key: string; pos: [number, number, number]; text: string }[] = [];
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue;
    const v = i * spacing.major;
    labels.push({ key: `x${i}`, pos: [v, -spacing.minor * 1.5, 0], text: String(v) });
    labels.push({ key: `y${i}`, pos: [-spacing.minor * 1.5, v, 0], text: String(v) });
  }

  const fontSize = spacing.major * LABEL_SCALE_FRACTION;

  return (
    <group>
      {labels.map((l) => (
        <Billboard key={l.key} position={l.pos} lockX lockY>
          <Text fontSize={fontSize} color="#666" anchorX="center" anchorY="middle">
            {l.text}
          </Text>
        </Billboard>
      ))}
      <Billboard position={[-spacing.minor * 1.5, -spacing.minor * 1.5, 0]} lockX lockY>
        <Text fontSize={fontSize} color="#444" anchorX="center" anchorY="middle">
          mm
        </Text>
      </Billboard>
    </group>
  );
}
```

- [ ] **Step 4: Replace the `<gridHelper>` element with `<AdaptiveGrid>` + `<AxisTickLabels>`, gated on `showGrid`**

Inside the existing `PreviewCanvas` function:

1. Add a hook call near the top, right after the existing `showCameraHUD` line:

```tsx
const showGrid = useUI((s) => s.showGrid);
```

2. Find this block in the JSX:

```tsx
        <gridHelper
          args={[1000, 20, "#cfcfcf", "#e5e5e5"]}
          rotation={[Math.PI / 2, 0, 0]}
        />
```

Replace with:

```tsx
        {showGrid && <AdaptiveGrid result={result} />}
        {showGrid && <AxisTickLabels result={result} />}
```

- [ ] **Step 5: Run the dev server and visually verify**

Run: `npm run dev` (background)

Open `http://localhost:5173/`. With the default text and font:
- The plain helper grid is gone.
- A drei `<Grid>` is visible on Z=0 with major lines every 50mm and minor lines every 10mm (default-letter case).
- Numbered tick labels appear along the X axis (Y=0 line) and Y axis (X=0 line) — values like `-100`, `-50`, `50`, `100`, etc.
- A small `mm` legend label sits near the origin.
- Type a much larger `letterHeight` (e.g. 800) — confirm the spacings auto-adapt to a coarser scale.

Stop the dev server when done.

- [ ] **Step 6: Run the full unit + e2e suites**

Run: `npm test -- --run`
Expected: all tests pass.

Run: `npm run e2e`
Expected: e2e smoke spec still passes (download zip layout + content unchanged).

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: clean — no errors. (`useMemo` is now used; the import was added in Step 2.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/PreviewCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(ui): replace gridHelper with adaptive labeled grid

drei <Grid> with cellSize/sectionSize derived from the current
geometry bbox via pickGridSpacing. Numbered tick labels along the X
and Y axes (lock-X/Y Billboard so they face the camera azimuth) plus
an "mm" legend at the origin. Both pieces gated on useUI.showGrid
(default true).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the bottom-left Grid-toggle button

**Files:**
- Modify: `src/ui/PreviewCanvas.tsx`
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Update `src/ui/styles.css`**

Find the existing `.preview-fit` block and the `.preview-errors` block. Replace the `.preview-errors` block AND the `.preview-fit` / `.preview-fit:hover` blocks with:

```css
.preview-errors {
  position: absolute; bottom: 0.5rem; left: 100px;
  background: #fee; color: #900; padding: 0.5rem; border-radius: 4px; font-size: 0.875rem;
}
.preview-toolbar {
  position: absolute; bottom: 12px; left: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.preview-toolbar-button {
  display: flex; align-items: center; justify-content: center;
  background: #fff; color: #555;
  border: 1px solid #ccc; border-radius: 4px;
  padding: 6px; cursor: pointer;
  transition: all 0.15s ease;
}
.preview-toolbar-button:hover {
  color: #111; background: #f5f5f5; border-color: #999;
}
.preview-toolbar-button.active {
  color: #111; background: #eef3ff; border-color: #6c8df0;
}
```

The `.preview-fit` class is removed and replaced with `.preview-toolbar-button` so both buttons share styling. The errors overlay shifts to `left: 100px` so the toolbar (max ~80px wide) doesn't sit on top of the error box when both are visible.

- [ ] **Step 2: Update the toolbar JSX in `PreviewCanvas.tsx`**

Find this block in `PreviewCanvas` (currently the lone Fit button):

```tsx
      <button
        className="preview-fit"
        onClick={() => setFitToken((n) => n + 1)}
        title="Fit camera"
        aria-label="Fit camera"
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
```

Replace with:

```tsx
      <div className="preview-toolbar">
        <button
          className="preview-toolbar-button"
          onClick={() => setFitToken((n) => n + 1)}
          title="Fit camera"
          aria-label="Fit camera"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <button
          className={`preview-toolbar-button${showGrid ? " active" : ""}`}
          onClick={() => setShowGrid(!showGrid)}
          title={showGrid ? "Hide grid" : "Show grid"}
          aria-label={showGrid ? "Hide grid" : "Show grid"}
          aria-pressed={showGrid}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="0" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        </button>
      </div>
```

- [ ] **Step 3: Add the `setShowGrid` selector in `PreviewCanvas`**

Just below the existing `const showGrid = useUI(...)` line you added in Task 3, add:

```tsx
const setShowGrid = useUI((s) => s.setShowGrid);
```

- [ ] **Step 4: Run dev server, verify the button toggles**

Run: `npm run dev`
Open `http://localhost:5173/`.

- The Fit button is at bottom-left (~12px in). Below it is a new grid icon button.
- The Grid button has the `active` styling on (blue tint) by default.
- Click it: grid + labels disappear; button switches to non-active styling.
- Click again: grid + labels reappear; styling re-applies.
- Confirm Fit button still works (re-fits camera on click).
- Confirm hover styling on both buttons.

Stop the dev server.

- [ ] **Step 5: Run lint and full test suite**

Run: `npm run lint`
Expected: clean.

Run: `npm test -- --run && npm run e2e`
Expected: all pass. The e2e fit-camera click selector still resolves: the e2e spec clicks via aria-label or text, not the removed `.preview-fit` class. Verify by reading `tests/e2e/smoke.spec.ts` if uncertain.

If the e2e DOES reference `.preview-fit` directly, update the selector in the same task to `[aria-label="Fit camera"]` or equivalent and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PreviewCanvas.tsx src/ui/styles.css
git commit -m "$(cat <<'EOF'
feat(ui): bottom-left toolbar with Fit + Grid toggle buttons

Replaces the lone .preview-fit button with a vertical .preview-toolbar
column. Both buttons share .preview-toolbar-button styling. The Grid
toggle wires to useUI.showGrid; an active class picks out the on
state. The errors overlay shifts to left: 100px so it clears the
toolbar when both are visible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the ViewCube widget

**Files:**
- Modify: `src/ui/PreviewCanvas.tsx`

- [ ] **Step 1: Add `GizmoHelper` and `GizmoViewcube` to the drei import**

Find the existing drei import line (added/updated in Task 3):

```tsx
import { OrbitControls, Grid, Text, Billboard } from "@react-three/drei";
```

Replace with:

```tsx
import { OrbitControls, Grid, Text, Billboard, GizmoHelper, GizmoViewcube } from "@react-three/drei";
```

- [ ] **Step 2: Add the `showViewcube` selector in `PreviewCanvas`**

Just below the existing `const setShowGrid = useUI(...)` line you added in Task 4, add:

```tsx
const showViewcube = useUI((s) => s.showViewcube);
```

- [ ] **Step 3: Add the `<GizmoHelper>` to the scene**

Find the closing tag of the existing `<SceneSetup ... />` element. Just before it (or just after — order doesn't matter, both are in-canvas children), insert:

```tsx
        {showViewcube && (
          <GizmoHelper alignment="top-left" margin={[64, 64]}>
            <GizmoViewcube
              color="#f5f5f5"
              opacity={0.95}
              strokeColor="#333"
              textColor="#222"
              hoverColor="#7aa6ff"
            />
          </GizmoHelper>
        )}
```

- [ ] **Step 4: Run the dev server and verify**

Run: `npm run dev`
Open `http://localhost:5173/`.

- A drei viewcube widget renders in the top-left corner.
- Click any face — the camera animates to look at the scene from that direction; distance to target preserved.
- Click an edge or corner — same behavior, multi-axis snap.
- Drag the cube — orbits the scene like dragging in the canvas.
- Type a long word, change letterHeight — viewcube remains in place.

Verify the **Z-up landmine** explicitly: click the cube's `"TOP"` face. The camera should look straight DOWN onto the letters from above (i.e. from +Z). If `"TOP"` puts you looking from +Y instead of +Z, the labels are wrong for our scene; in that case, fall back to `<GizmoViewport>` per the spec's risk section. Replace the `<GizmoViewcube>` element with:

```tsx
<GizmoViewport axisColors={["#ff5050", "#50c050", "#5070ff"]} labelColor="#222" />
```

— this is purely vector-driven (red=X, green=Y, blue=Z arrows) so no labeling can be wrong. Re-test that clicking each axis arrow snaps the camera correctly.

Stop the dev server.

- [ ] **Step 5: Run lint, full test + e2e suites**

Run: `npm run lint`
Expected: clean.

Run: `npm test -- --run && npm run e2e`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PreviewCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(ui): top-left ViewCube for camera orientation

drei <GizmoHelper> + <GizmoViewcube> in the top-left corner of the
canvas. Click any face/edge/corner to snap the camera to that
orientation; drag to orbit. Distance to target preserved. Gated on
useUI.showViewcube (default true; no UI toggle in v1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the existing CLAUDE.md**

Open `CLAUDE.md`. Find:

- The "Preview shading" section (covers `<PreviewLetter>` shading + plexi material).
- The "Known landmines" section (covers the `<SoftShadows>` removed-helper bug).
- The "Spec / plan" section (lists every shipped sub-project's spec path).

- [ ] **Step 2: Add a "Viewer" subsection right after "Preview shading"**

Insert this new section between the "Preview shading" section and the "Export format" section:

```markdown
## Viewer

`PreviewCanvas.tsx` composes:

- A drei `<Grid>` (rotated `[Math.PI/2, 0, 0]` so it lands on world XY) with `cellSize` / `sectionSize` derived from the geometry bbox via `src/ui/grid-spacing.ts`'s `pickGridSpacing` (NICE_NUMBERS sequence 1/2/5/10/20/50/100/200/500/1000/2000/5000, target ~5 major lines across `max(bboxX, bboxY)`).
- Numbered tick labels along the X axis (Y=0) and Y axis (X=0) using drei `<Text>` inside `<Billboard lockX lockY>` — labels rotate around world Z to face the camera azimuth so they read at any orbit angle except strict top-down. Capped at `MAX_TICKS_PER_DIRECTION = 30` per axis.
- An `mm` legend label at the origin so the unit is unambiguous; the `"0"` tick is suppressed.
- A drei `<GizmoHelper><GizmoViewcube/></GizmoHelper>` in the top-left for click-to-orient (faces / edges / corners). Distance to target is preserved; only orientation changes.
- A bottom-left `.preview-toolbar` column with the existing Fit button + a new Grid-toggle button.

Both grid and viewcube are gated on `useUI.showGrid` / `useUI.showViewcube` (session-only flags, defaults `true`). Only `showGrid` has a UI toggle button in v1; `showViewcube` exists in the store for a future toggle.

Known viewer landmine: drei's `<GizmoViewcube>` derives orientation from `camera.up`, which our scene sets to `(0, 0, 1)`. Verify the `"TOP"` face truly looks down +Z when the spec is implemented or revisited; if drei's labels misalign for our Z-up convention, fall back to `<GizmoViewport>` (axis arrows, vector-driven, no labels).
```

- [ ] **Step 3: Add the new spec to the "Spec / plan" list**

Find the existing list of shipped specs:

```markdown
- Mounting-features feature spec: `docs/superpowers/specs/2026-06-10-mounting-features-design.md` (current with code).
```

Insert directly after it:

```markdown
- Viewer-improvements feature spec: `docs/superpowers/specs/2026-06-11-viewer-improvements-design.md` (current with code).
```

- [ ] **Step 4: Run lint + tests as a final sanity check**

Run: `npm run lint && npm test -- --run`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude.md): document viewer improvements (grid + viewcube)

Adds a Viewer subsection covering the adaptive labeled grid, the
ViewCube widget, gating flags, and the Z-up viewcube landmine. Adds
the spec path to the Spec / plan list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Closeout

After all six tasks are merged on the working branch:

- Run `npm run lint && npm test -- --run && npm run e2e && npm run build`. All four must be clean.
- Manual smoke in `npm run dev`: type "BAR" with `letterHeight=200`, change to `letterHeight=800`, type "INTERNATIONAL", clear and retype. Confirm grid spacings adapt, viewcube clicks animate the camera, Fit button still recenters, Grid toggle hides/shows everything.
- Hand off to `superpowers:finishing-a-development-branch` for merge / PR / cleanup choice.
