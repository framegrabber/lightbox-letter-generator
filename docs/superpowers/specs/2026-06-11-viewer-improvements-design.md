# Viewer Improvements (ViewCube + Adaptive Labeled Grid) — Design Spec

Date: 2026-06-11

Two viewer-only features that ship together: a CAD-style viewcube in the corner for orienting/snapping the camera, and an adaptive labeled ground grid that doubles as a visual size indicator for the geometry. Both replace the current plain `gridHelper` plane and the absence of any orientation widget.

## Goal

Give the user immediate visual answers to two questions every time they look at the preview:

- **"Which way am I looking?"** — answered by a clickable viewcube, drei's `<GizmoViewcube>` set into the canvas corner.
- **"How big is this thing?"** — answered by a graph-paper ground plane with numbered tick labels along the X and Y axes, spaced by a "nice number" major/minor scheme that auto-adapts to the geometry's bbox.

Both features are session-only toggleable via `useUI`. Neither persists across sessions; the existing `showCameraHUD` / `showPlexi` pattern.

## Scope

In scope:

- New `useUI` flags: `showGrid` (default `true`) and `showViewcube` (default `true`).
- drei `<Grid>` replacing the existing `<gridHelper>` in `PreviewCanvas.tsx`.
- Adaptive grid spacing via a pure helper `pickGridSpacing(bboxMaxDim) → { major, minor }`.
- Numbered tick labels along the X axis (Y=0) and Y axis (X=0) only, using drei `<Text>` with lock-X/Y `<Billboard>` rotation.
- drei `<GizmoHelper>` + `<GizmoViewcube>` in the top-left canvas corner, full 26-view (faces + edges + corners).
- New "Grid toggle" floating icon button stacked vertically with the existing "Fit camera" button at top-right of the canvas.
- New unit tests for `pickGridSpacing` and a small `componentsBBox` helper.
- CLAUDE.md note describing the new viewer pieces and the Z-up viewcube landmine.

Out of scope:

- ViewCube on/off toggle button. The cube is itself visible; a separate toggle is redundant for v1.
- Separate label on/off. Labels are coupled to the grid; one toggle controls both.
- Persisted preferences (URL/localStorage). Session-only via `useUI`.
- Wireframe bbox helper or DOM dimension readout — the labeled grid solves the "how big" question.
- CAD-style dimension lines with arrows.
- Snap-to-axis, constrain-orbit, double-click-to-fit on the viewcube, custom face textures.
- Moving existing `PlexiToggle` / `CameraHUDToggle` into a new "Viewer" section. Existing toggles stay where they are.

## User-visible behaviour

- On a fresh page load, the canvas shows: an adaptive labeled grid on the Z=0 plane, a viewcube widget in the top-left corner, and a vertical toolbar of two icon buttons (Fit, Grid) at top-right.
- Clicking any viewcube face/edge/corner animates the camera's orientation to that view; distance to target is preserved (drei default behavior). Dragging the cube orbits the scene the same way as orbiting in the canvas.
- Clicking the **Grid** icon button toggles `showGrid`. The grid plane and tick labels both hide/show together; the icon flips between a filled and outline state to indicate state.
- Typing different-sized text changes the grid spacing automatically. A 200mm-tall letter and a 2000mm-tall letter both produce a grid with roughly 5 major lines across the larger horizontal bbox dimension.
- Tick labels along the X axis (`y=0`) and Y axis (`x=0`) read in plain integer mm (`"50"`, `"-100"`). A small `"mm"` label sits at the origin so the unit is unambiguous. The `0` tick at the origin itself is suppressed (the `"mm"` legend label takes its place).
- Labels rotate around the world Z axis to face the camera azimuth (lock-X/Y billboard) so they read left-to-right at any orbit angle except strict top-down. At top-down they appear edge-on; that's acceptable since the user can read the grid lines themselves.
- The existing `gridHelper` plane is removed. The existing Fit button, plexi toggle, camera-HUD toggle, and bottom-left HUD overlay are all unchanged.

## Parameters / state

Added to `UIState` in `src/state/ui.ts`:

| Field | Type | Default | Persistence |
|---|---|---|---|
| `showGrid` | `boolean` | `true` | session-only |
| `setShowGrid` | `(v: boolean) => void` | — | — |
| `showViewcube` | `boolean` | `true` | session-only |
| `setShowViewcube` | `(v: boolean) => void` | — | — |

`showViewcube` has no UI toggle in v1; it exists in the store so a future toggle can be wired in without state migration.

No changes to `src/state/parameters.ts`, `src/state/persistence.ts`, or any geometry/exporter code.

## Geometry & rendering

### `src/ui/grid-spacing.ts` (new, pure)

```ts
export type GridSpacing = { major: number; minor: number };

const NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const TARGET_MAJOR_LINES = 5;

export function pickGridSpacing(bboxMaxDim: number): GridSpacing {
  if (!Number.isFinite(bboxMaxDim) || bboxMaxDim <= 0) {
    return { major: 50, minor: 10 };
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

// Returns the world-space XY bbox covering every component, using each
// component's pre-centering bbox plus its xOffset.
//
// The worker stores `vertProperties` already centered on the component's own
// bbox, while keeping `bbox` (pre-centering, in word space) and `xOffset`
// (the word-space minX). PreviewLetter places the component group at
// (xOffset + cx, cy), which means the world-space X extent of a rendered
// component is exactly [xOffset + bbox.minX, xOffset + bbox.maxX] and the
// Y extent is [bbox.minY, bbox.maxY]. No vertex walk needed.
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

Both functions are pure — no React, no three.js, no DOM. Easily unit-tested.

`componentsBBox` reads the worker-output `bbox` (pre-centering, word-space) and adds `xOffset`. It does NOT walk vertices — the rendered world-space extent is fully determined by `bbox + xOffset` because `PreviewLetter` shifts the group by exactly `xOffset + cx` (which puts the original word-space `bbox.minX` at world `xOffset + bbox.minX`). See the CLAUDE.md "Mesh centering caveat" for the centering convention.

### `<AdaptiveGrid>` (inline in `PreviewCanvas.tsx`)

```tsx
function AdaptiveGrid({ result }: { result: BuildResult | null }) {
  const spacing = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    if (!bbox) return pickGridSpacing(0); // default 50/10
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
```

The `[Math.PI/2, 0, 0]` rotation puts the drei `<Grid>` (which renders in the XZ plane by default) on the world XY plane to match our Z-up scene. `infiniteGrid` makes the plane fade out toward the horizon; `fadeDistance` scales with the spacing so labels at the far edge stay legible.

### `<AxisTickLabels>` (inline in `PreviewCanvas.tsx`)

```tsx
const MAX_TICKS_PER_DIRECTION = 30;
const LABEL_SCALE_FRACTION = 0.18;

function AxisTickLabels({ result }: { result: BuildResult | null }) {
  const { spacing, range } = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    const dim = bbox
      ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
      : 0;
    const sp = pickGridSpacing(dim);
    const r = Math.min(MAX_TICKS_PER_DIRECTION, Math.ceil((Math.max(dim, sp.major * 5) * 1.5) / sp.major));
    return { spacing: sp, range: r };
  }, [result]);

  const labels: { key: string; pos: [number, number, number]; text: string }[] = [];
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue; // legend label sits at origin
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
        <Text fontSize={fontSize} color="#444" anchorX="center" anchorY="middle">mm</Text>
      </Billboard>
    </group>
  );
}
```

`<Billboard lockX lockY>` rotates around world Z only (drei's prop semantics). Labels stay flat on XY but face the camera azimuth.

`MAX_TICKS_PER_DIRECTION = 30` caps total labels at 60 X + 60 Y = 120 max. Past that range the grid lines continue but labels stop — protects against pathological inputs (5000mm letter generating hundreds of labels).

### `<GizmoHelper>` + `<GizmoViewcube>`

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

Top-left placement: away from the existing top-right Fit/Grid toolbar and bottom-left camera-HUD overlay.

drei's `<GizmoViewcube>` is the full 26-view widget: 6 faces, 12 edges, 8 corners. Click any region to animate the camera to that orientation. Distance to target preserved automatically.

### Floating toolbar (top-right)

A small vertical column of icon buttons at the top-right of `.preview-canvas`:

1. **Fit** (existing — keep). Re-runs the same auto-fit logic that runs on the first geometry load.
2. **Grid toggle** (new). Filled icon when `showGrid=true`, outline when `false`.

Both buttons reuse the existing `.preview-fit` button styling (transparent background, hover state, ~32×32). The CSS class can be generalized to `.preview-toolbar-button` with positional wrappers, or each button gets its own class. Implementer's choice.

The Fit button keeps its current behavior — there's no double-click-to-fit on the viewcube, and the auto-fit-on-first-load logic is unchanged. Fit is the only way to recenter the camera when the bbox changes (e.g. type "BURGER" then bump letterHeight 100 → 500); the viewcube only changes orientation.

## Files touched

**Created:**

- `src/ui/grid-spacing.ts` — `pickGridSpacing` and `componentsBBox` pure helpers
- `tests/unit/ui/grid-spacing.test.ts`

**Modified:**

- `src/ui/PreviewCanvas.tsx`
  - Replace `<gridHelper>` with `<AdaptiveGrid result={result} />` (gated by `showGrid`)
  - Add `<AxisTickLabels result={result} />` (also gated by `showGrid`)
  - Add `<GizmoHelper><GizmoViewcube/></GizmoHelper>` (gated by `showViewcube`)
  - Add the Grid-toggle button alongside the existing Fit button
  - Inline `AdaptiveGrid` and `AxisTickLabels` components in this file (small, scoped to viewer)
- `src/state/ui.ts` — add `showGrid` (default `true`), `setShowGrid`, `showViewcube` (default `true`), `setShowViewcube`
- `src/ui/styles.css` — toolbar styling (vertical stack at top-right); ensure GizmoHelper canvas overlay layers cleanly above the existing canvas overlays
- `CLAUDE.md` — short note in a new "Viewer" subsection (or extend "Preview shading"): drei `<Grid>`, viewcube, adaptive spacing helper, Z-up viewcube landmine

## Tests

**`tests/unit/ui/grid-spacing.test.ts` (new):**

- `pickGridSpacing(0)` → `{ major: 50, minor: 10 }` (default)
- `pickGridSpacing(NaN)` → default
- `pickGridSpacing(-1)` → default
- `pickGridSpacing(50)` → ideal = 10; major picked = 10, minor = 2
- `pickGridSpacing(200)` → ideal = 40; major picked = 50, minor = 10 (default-letter case)
- `pickGridSpacing(2000)` → ideal = 400; major picked = 500, minor = 100
- `pickGridSpacing(1_000_000)` → caps at largest NICE_NUMBERS entry (5000)
- `componentsBBox([])` → `null`
- `componentsBBox` with one component shifts world-space X by `xOffset` and leaves Y unchanged
- `componentsBBox` with two components covers the union of word-space extents (e.g. component A at xOffset=0, B at xOffset=200, B's `[0..50]` extent must produce world maxX=250)

No new e2e assertions. The existing smoke spec mounts the canvas and exports — both still work. Verifying viewcube clicks, grid lines, or label positioning in Playwright is overkill for v1.

## Risks / known landmines (verify in implementation)

1. **drei `<GizmoViewcube>` Z-up labeling.** drei reads parent `camera.up`. Whether the face labels (`"TOP"`, `"FRONT"`, etc.) align sensibly with our Z-up scene needs PoC verification. If labels are wrong/confusing, fall back to drei's `<GizmoViewport>` (axis arrows, no text) which is purely vector-driven.
2. **drei `<Grid>` on Z-up scene.** The `[Math.PI/2, 0, 0]` rotation aligns the grid to XY. drei's grid uses a custom shader; confirm shading isn't broken in our scene's lighting.
3. **drei `<Text>` font.** Default SDF font ships with drei; first-render flash is acceptable.
4. **Damping conflict.** OrbitControls damping vs viewcube animation. Cosmetic; address only if visible jitter appears.
5. **Existing CLAUDE.md "Known landmines" section** mentions drei's `<SoftShadows>` failing because of a removed three.js helper. The viewcube and grid don't use that path, but worth a sanity check that no current drei sub-export fails to compile against three 0.184.

## Acceptance

- Default load: labeled grid visible, viewcube visible top-left, Fit + Grid icons stacked top-right.
- Grid toggle hides/shows grid + labels together. Icon state reflects toggle state.
- ViewCube click on any face/edge/corner animates camera to that orientation; distance preserved.
- A 200mm-tall letter and a 2000mm-tall letter both produce a grid with ~5 major lines across the bbox max dimension; spacings come from the NICE_NUMBERS sequence.
- Empty/no-text state: grid + viewcube still render; existing "Type a word to begin" overlay shows.
- Labels read left-to-right at any orbit angle except strict top-down.
- `npm test` passes (new tests + all existing).
- `npm run e2e` passes (no assertion changes).
- `npm run lint` clean.
- `npm run build` clean.
- No persisted-state migration needed; `useUI` is session-only.
