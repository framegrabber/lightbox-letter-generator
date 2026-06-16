# Build-volume slicing — design

Date: 2026-06-16

## Problem

A connected-script word produces one giant merged `Component` (via `merge.ts`'s union of overlapping glyph contours). Its assembled X extent routinely exceeds the build volume of a typical 3D printer (220 mm bed is common; a tasteful cursive lightbox word easily reaches 600+ mm). Today the user has no way to split that geometry into printable pieces from inside the app — they'd have to slice the exported STL manually, and they'd lose cable-channel continuity, plexi alignment, and mount placement in the process.

This feature adds a parameterised slicing pass that takes any one `Component` and cuts it into N sub-components along user-defined vertical cut planes. Each sub-component flows through the existing `shell.ts` → plexi → cable-holes → bulb-holes → mounts pipeline unchanged. The export bundles **both** the full (assembled) geometry and the sliced pieces so the user can pick at print time.

Joinery: butt + glue. No mechanical interlock, no tabs, no dovetails. The cut faces are flat planes; the user supplies CA glue, plastic weld, or epoxy at assembly.

Out of scope: alignment pegs, dovetail/lap joinery, in-viewport drag-to-edit cut handles, automatic detection of "good" cut waists, font-driven default angles, per-letter cut overrides, slicing along the Y axis. See "Scope cuts" below.

## Cut model

A cut is a single vertical plane that extends from the lowest face of the geometry (`Z = 0`) to the front face (`Z = totalDepth + backCavityDepth`). In the XY plane it is defined by an X intercept and an angle from the Y axis:

```ts
export type Cut = {
  x: number;       // mm, in word-space X (same coordinate as `xOffset` + glyph X)
  angle: number;   // degrees, signed; 0 = vertical cut, +tilts top of the line to the right
};
```

The cut line in world space passes through `(x, 0)` and `(x + h·tan(angle), h)` for any `h`. Angle is clamped to `(-89°, +89°)` to avoid degenerate near-horizontal cuts.

## Parameters

New entries in `src/state/parameters.ts`:

```ts
maxPieceWidth: number;   // mm. 0 = slicing disabled. Default 0.
cuts: Cut[];             // ordered by x at suggest-time; user can reorder by editing x. Default [].
```

`maxPieceWidth` is the printer's X build-volume budget. It drives only the **Suggest cuts** action — it does not auto-trigger slicing on its own. Slicing applies whenever `cuts.length > 0`, regardless of `maxPieceWidth`.

Validation: `maxPieceWidth >= 0`. Per-cut `angle` clamped to `(-89, +89)`. `x` accepts any real number; the slicer filters out cuts whose `x` falls outside the relevant Component's bbox at build time, so saved cuts survive a text or font change without erroring out at the form level.

## Suggest algorithm

Pure helper, called from the controls panel:

```ts
export function suggestCuts(
  wordBBox: { minX: number; maxX: number },
  maxPieceWidth: number,
): Cut[];
```

Behaviour:

1. If `maxPieceWidth <= 0` or `(maxX - minX) <= maxPieceWidth` → return `[]`.
2. `n = ceil((maxX - minX) / maxPieceWidth)` — the number of pieces.
3. For `i` in `1..n-1`: push `{ x: minX + i*(maxX-minX)/n, angle: 0 }`.

Idempotent. Always produces equal-width pieces with vertical (`angle = 0`) cuts. The user then edits `x` and `angle` per cut to land the seams visually.

The Suggest button **destructively replaces** the current `cuts` list. The destructiveness is intentional: re-suggesting is the documented "I want a fresh start" gesture. If the user wants to preserve a manual edit, they don't click Suggest.

## Slicer

New module `src/geometry/slice.ts`. Pure function, no React, no DOM.

```ts
export type SlicedPiece = Component & {
  sliceIndex: number;             // 1-based, left-to-right
  totalSlices: number;
  parentMembers: ComponentMember[];
};

export type OuterEdges = { left: boolean; right: boolean };

export type SliceWarning =
  | { kind: "slice_empty";   componentMembers: ComponentMember[]; sliceIndex: number }
  | { kind: "slice_crossed"; cuts: [number, number] }
  | { kind: "slice_oversize"; componentMembers: ComponentMember[]; sliceIndex: number; width: number }
  | { kind: "slice_recommended"; componentMembers: ComponentMember[] };

export function sliceComponent(
  component: Component,
  cuts: Cut[],
  maxPieceWidth: number,    // for slice_oversize and slice_recommended warnings
): {
  pieces: SlicedPiece[];
  outerEdges: OuterEdges[];
  warnings: SliceWarning[];
};
```

Algorithm:

1. Filter `cuts` to those whose `x` lies within `(component.bbox.minX, component.bbox.maxX)` (strict — a cut exactly on the bbox edge is dropped, no-op).
2. If the filtered list is empty:
   - If `maxPieceWidth > 0` and `(maxX - minX) > maxPieceWidth`, emit a single `slice_recommended` warning.
   - Return `{ pieces: [component], outerEdges: [{left: true, right: true}], warnings }`.
3. Sort filtered cuts by `x`.
4. Detect any pair of cuts whose lines cross *inside* the component's bbox Y range; for each crossing pair emit a `slice_crossed` warning. Pieces are still produced.
5. Build N+1 "strip" polygons (`CrossSection`s) from the cuts. Each strip is the convex region between two adjacent cut lines, clipped to a generous bbox-aligned bounding rectangle (margin = max bbox extent, so corners never miss). The first strip's "left cut" and the last strip's "right cut" are vertical lines at `bbox.minX - margin` and `bbox.maxX + margin` respectively.
6. For each strip: `piecePoly = component.mergedContours ∩ strip` (CrossSection `intersect`). If `piecePoly.area() < 0.5 mm²` → drop the piece and emit `slice_empty`. Otherwise convert back to `GlyphContours`, recompute the piece's bbox from the new contours, and emit a `SlicedPiece` with `sliceIndex` and `totalSlices` set, `mergedContours` replaced by `piecePoly`, `members` inherited from the parent (every piece references the full parent's member list — the slicer doesn't try to attribute glyphs to pieces), and `bbox` recomputed from the new contours (still in word space).

   Note: `Component` does not carry an `xOffset` field — only `ComponentMember`s do. Sliced pieces' `bbox` is in word space, which is sufficient to drive both the downstream `xOffset: 0` `ComponentMesh` convention (`PreviewLetter` reconstructs the world position from the bbox center) and the worker's per-component cable-hole / bulb-hole / mount logic. If a cut passes through an internal hole (e.g. through the interior of an `o`), the boolean intersection bisects the hole naturally — each piece carries its half as a partial cavity, and the hole reconstitutes on glue-up.
7. For each surviving piece, check whether its bbox X extent exceeds `maxPieceWidth` (when `maxPieceWidth > 0`); emit `slice_oversize` if so.
8. Compute `outerEdges` for the surviving pieces:
   - 1 piece: `[{l:t, r:t}]` (no slicing applied — degenerate case)
   - N pieces: `[{l:t, r:f}, {l:f, r:f}, …, {l:f, r:t}]`. Outer ends only.
9. Delete every intermediate `CrossSection` inline.

The slicer never holds a 3D `Manifold`. All operations are 2D.

## Worker flow

`src/geometry/worker.ts` after merge:

```
mergeResult.components: Component[]
  ↓
fullComponents = mergeResult.components                 // run as today

For each Component c:
  { pieces, outerEdges, warnings } = sliceComponent(c, params.cuts, params.maxPieceWidth)
  slicedPieces.push(...pieces)
  perPieceOuterEdges.push(...outerEdges)
  sliceWarnings.push(...warnings)
  ↓
slicedComponents = slicedPieces                         // each piece runs through shell/plexi
```

Both lists then enter the existing per-component build loop. `buildLetterShell` and `mounts.ts` accept the new `outerEdges` argument. Cable-hole and bulb-hole computation are unchanged in shape — they take the component's `mergedContours` as input, which for sliced pieces is the **piece's** contour, so bulb-hole skeleton tracing happens inside the piece, not the parent.

Cable holes between original letters: the worker's existing X-bbox overlap filter applies. A cable cylinder that straddles a cut plane will overlap **both** adjacent pieces' bboxes and be passed to both — same behaviour as today's cross-component-letter case. Each piece carves its half. After glue-up the channel reconstitutes.

Power-entry cable holes (`cableHoleAtEnds = true`) gain a `outerEdges` check: skip the left-end hole when `outerEdges.left = false`, skip the right-end hole when `outerEdges.right = false`. Only the actual word boundaries get power-entry holes.

## Result envelope

`src/geometry/worker-client.ts` extends `BuildResult`:

```ts
export type BuildResult = {
  components: ComponentMesh[];           // full, unchanged
  slicedComponents: SlicedComponentMesh[];  // new; empty when no slicing applied
  errors: BuildError[];
  warnings: (MergeWarning | SliceWarning)[];
};

export type SlicedComponentMesh = ComponentMesh & {
  sliceIndex: number;
  totalSlices: number;
  parentSlot: number;   // 1-based, matches the parent's index in `components` (+ 1)
};
```

`SlicedComponentMesh.parentSlot` is what the exporter uses to colocate sliced files under their parent's slot (and feeds directly into `SlicedShellEntry.parentSlot`).

## Preview

`PreviewCanvas.tsx` adds a `<CutLines>` overlay inside the existing `<group rotation={[-Math.PI/2, 0, 0]}>` so it sits in world-Z-up space alongside the geometry:

- Iterate `params.cuts`. For each, build a thin red rectangle (Three.js `BoxGeometry`, dims `(0.6, wordBboxY + 2·margin, totalDepth + backCavityDepth)`) translated to `(cut.x, (wordBboxY.min + wordBboxY.max)/2, (totalDepth + backCavityDepth)/2)`, rotated by `cut.angle` around Z.
- Material: `MeshBasicMaterial({ color: '#e53935', transparent: true, opacity: 0.55, depthTest: false })`. The line reads on top of the shells regardless of camera angle.
- Tag the group with `userData.isSizeIndicator = true` so `SceneSetup`'s auto-fit traverse skips it (otherwise the box geometries would inflate the bbox; the auto-fit already filters by this flag).
- Gated on `params.cuts.length > 0`. Always rendered when cuts exist — no toggle.

The assembled (full) shells continue to render as today. Sliced meshes are export-only in v1; they are not shown in the preview.

## Controls

`src/ui/ControlsPanel.tsx` gains a new "Slicing" fieldset, after "Mounts" and "Bulb holes":

- One `NumberField` for **Max piece width (mm)**.
- A **Suggest cuts** button. Disabled when `maxPieceWidth <= 0` or no word geometry is built yet. Computes `suggestCuts(wordBBox, maxPieceWidth)` and replaces `params.cuts`.
- The cuts list: each row carries a small "cut N" label, two `NumberField`s (X position mm, angle°), and a **Remove** button.
- An **Add cut** button below the list (appends `{ x: midpoint, angle: 0 }`).
- A **Clear cuts** button below the list (sets `cuts = []`).
- Help text on the Max piece width field: "Printer build volume in X. Zero disables Suggest. Slicing always applies when cuts are present."

The preview's red lines update in real time as the user edits any cut value.

## Exports

### Zip layout

```
lightbox-<text>-<localIso>.zip
├── README.txt
├── stl/
│   ├── chars/
│   │   ├── 01_lorem_char.stl                  # full geometry
│   │   ├── 01_lorem_char_slice-1.stl          # only when sliced
│   │   ├── 01_lorem_char_slice-2.stl
│   │   └── 01_lorem_char_slice-3.stl
│   └── plexi/
│       ├── 01_lorem_plexi.stl
│       ├── 01_lorem_plexi_slice-1.stl
│       ├── 01_lorem_plexi_slice-2.stl
│       └── 01_lorem_plexi_slice-3.stl
└── svg/
    ├── 01_lorem_plexi.svg
    ├── 01_lorem_plexi_slice-1.svg
    ├── 01_lorem_plexi_slice-2.svg
    └── 01_lorem_plexi_slice-3.svg
```

Convention: existing `<slot>_<chars>_<kind>.{stl,svg}` plus optional `_slice-<idx>` suffix.

- `<idx>` is 1-based. Zero-padded only when `totalSlices >= 10` (so `_slice-01..09` only kicks in for words sliced into 10+ pieces — uncommon).
- When a Component isn't sliced, no `_slice-*` files appear under its slot. The "full" file alone represents that Component.
- Components without a plexi (e.g. `plexi_collapsed`) skip both the full and sliced plexi STL/SVG slots; the shell still ships.
- A sliced piece that itself has no plexi (its rabbet collapsed) skips just that sliced plexi file; its shell still ships.

### `bundleAll` signature

Existing convention: `shells`, `plexiStls`, `plexiSvgs` are flat arrays of typed entries; each entry's slot is its array index. Sliced variants follow the same flat-array style but every slice entry carries its parent's slot number explicitly:

```ts
export type SlicedShellEntry    = ShellEntry    & { parentSlot: number; sliceIndex: number; totalSlices: number };
export type SlicedPlexiStlEntry = PlexiStlEntry & { parentSlot: number; sliceIndex: number; totalSlices: number };
export type SlicedPlexiSvgEntry = PlexiSvgEntry & { parentSlot: number; sliceIndex: number; totalSlices: number };

export function bundleAll(
  shells: ShellEntry[],                            // full
  plexiStls: PlexiStlEntry[],                      // full; absent entries = no plexi for that slot
  plexiSvgs: PlexiSvgEntry[],
  slicedShells: SlicedShellEntry[],                // flat; one entry per piece, with parentSlot explicit
  slicedPlexiStls: SlicedPlexiStlEntry[],
  slicedPlexiSvgs: SlicedPlexiSvgEntry[],
  readme: string,
): Promise<Blob>;
```

A slice entry's filename uses `pad2(parentSlot)` as the slot prefix (so slices nest under the parent visually in the zip) plus `_slice-<sliceIndex>` (zero-padded when `totalSlices >= 10`). Slices for a component that wasn't sliced simply don't appear in the sliced arrays.

### README

`buildReadme` gains a "Slicing" section, emitted only when `params.cuts.length > 0`:

```
Slicing
  Max piece width:    220 mm
  Cuts (3):
    Cut 1: x = 200.0 mm,  angle =  0.0°
    Cut 2: x = 400.0 mm,  angle = 12.0°
    Cut 3: x = 600.0 mm,  angle =  0.0°
  Pieces per word:    4
```

### Filename builder

`src/exporters/filename.ts` — unchanged for the zip-name itself. Sliced file basenames are built in `bundleAll` via the existing `<chars>` sanitiser plus the `_slice-<padded-idx>` suffix.

## Edge cases

| Situation | Behaviour |
|---|---|
| `cuts` empty | No slicing; `slicedComponents` is empty in the build result; exporter emits only full files. |
| `maxPieceWidth = 0` | Suggest button disabled; existing cuts still apply if present. |
| `maxPieceWidth > 0` and a component still exceeds it AND `cuts` is empty | Emit `slice_recommended` info-level warning. Build proceeds with full geometry only. |
| Cut's `x` outside a component's bbox | Filtered out for that component; silent. |
| Piece with area < 0.5 mm² | Dropped; `slice_empty` warning. Adjacent pieces unaffected. |
| Two cuts crossing inside the bbox Y range | Pieces still emitted (CrossSection booleans handle non-convex strips); `slice_crossed` warning surfaced. |
| Per-cut angle clamping | Snaps to `±89°` at the input; UI shows the bound via `NumberField`. |
| Piece bbox width still > `maxPieceWidth` (user dragged cuts off the auto layout) | `slice_oversize` warning. Piece still exports. |
| Piece too narrow for a plexi rabbet | `plexi_collapsed` warning (existing). That piece's `_slice-N_plexi.stl` and `_slice-N_plexi.svg` are omitted; its shell still ships. |
| Saved `cuts` whose `x` lies outside the new word's bbox after text edit | Kept in state, filtered at the slicer. User re-Suggests when ready. |
| Mount slots on internal cut edges | Suppressed via `outerEdges`. Middle pieces of a multi-piece slice receive no mounts. |
| Cable hole straddling a cut plane | Existing X-bbox overlap filter passes the hole to both adjacent pieces — each carves its half. |
| Power-entry cable hole on an internal cut edge | Suppressed via `outerEdges` check inside `cable-holes.ts`. |
| Bulb hole bisected by a cut | Each piece computes its own bulb-hole skeleton from its own contours, so bisected holes don't even arise — the skeleton stays within the piece, and any pre-cut hole that happened to land on the seam reconstitutes naturally on assembly. |
| Bridges within a merged component crossed by a cut | The cut bisects the bridge cross-section along with the rest of the merged contour. No special-case. |

## WASM lifecycle

`sliceComponent` allocates several `CrossSection`s per call: the merged contour input, one bounding rectangle (margin clip), N+1 strips, N+1 intersected pieces. Discipline:

- Each strip and each intersection result is named to a local and `.delete()`-ed after its `mergedContours` are extracted (`piecePoly.toPolygons()` then immediately `.delete()`).
- The bounding rectangle is deleted at end-of-function.
- No `Manifold` (3D) is touched inside the slicer.
- `.toPolygons()` returns plain JS arrays — safe to retain across deletes.

## Build performance

For an N-piece slice on one Component, the worker does N+1 full per-piece builds (one shell + one plexi each) versus today's single per-component build. Empirically: ~80 ms per shell, ~30 ms per plexi → ~110 ms per piece. A 3-piece script word adds ~330 ms over the unsliced build. Full-Component build runs first and posts an interim message so the preview updates before the sliced pieces finish. The interim post is the existing `preview-ready` channel from `worker.ts`; no protocol changes.

## State persistence

`state/persistence.ts`:

- `migrate()`: defaults `maxPieceWidth: 0` and `cuts: []` when absent from a legacy save.
- `cuts` serialises as a JSON array under `p` (no special-casing — the existing `URLSearchParams` + `JSON.stringify` path handles arrays of objects).

No legacy field renames.

## Tests

Unit tests under `tests/unit/`:

- `slice.test.ts` (new):
  - Empty cuts → returns the input as a single piece (identity-on-no-cuts).
  - Single vertical cut at the bbox midpoint of a square contour → two equal pieces; summed areas equal the original within 1e-3 mm².
  - Cut whose `x` is outside the bbox → filtered out, single piece returned.
  - Angled cut (`θ = 15°`) on a wide rectangle → two trapezoidal pieces; each piece's bbox X extent matches the analytical sliced extent within 1e-3 mm.
  - Two cuts producing a degenerate sliver (`< 0.5 mm²`) → that piece dropped, `slice_empty` warning emitted, adjacent pieces intact.
  - Crossing cuts (two cuts whose lines intersect inside the bbox) → `slice_crossed` warning emitted; both pieces still produced; total area conserved within 1e-3 mm².
  - `outerEdges` correct for piece counts of 1, 2, 3, 4 (1 keeps `{l:t, r:t}`; 4 produces `[{l:t,r:f},{l:f,r:f},{l:f,r:f},{l:f,r:t}]`).
  - Letter with a hole (e.g. `o`) split by a cut → hole survives intact in whichever piece contains it; the other piece has no spurious hole.
  - `slice_oversize` warning emitted when a piece's width still exceeds `maxPieceWidth` after slicing (user-edited cuts).

- `suggest-cuts.test.ts` (new):
  - `maxPieceWidth = 0` → `[]`.
  - Word width <= `maxPieceWidth` → `[]`.
  - Word width = `2·maxPieceWidth` → exactly one cut at the midpoint with `angle = 0`.
  - Word width = `3·maxPieceWidth` → exactly two cuts at thirds with `angle = 0`.
  - Idempotency: two suggests with the same inputs return identical arrays.

- `parameters.test.ts` (extended): `DEFAULT_PARAMETERS` includes `maxPieceWidth: 0` and `cuts: []`.

- `validate.test.ts` (extended): `maxPieceWidth < 0` clamps to 0; per-cut `angle` clamps to `±89`.

- `persistence.test.ts` (extended): `migrate()` populates defaults when fields are absent; populated `cuts` round-trips through URL + localStorage.

- `mounts.test.ts` (extended): `outerEdges.left = false` suppresses left slot + tab entirely; `right = false` suppresses right; both false → empty `MountPlan`.

- `cable-holes.test.ts` (extended): `cableHoleAtEnds = true` combined with `outerEdges.left = false` does not emit the left power-entry hole; boundary holes between letters are unaffected by `outerEdges`.

- `zip.test.ts` (extended): `bundleAll` with mixed input (one Component sliced, one not). Assert the exact file list — sliced component has `*_char.stl` plus `*_char_slice-{1,2,…}.stl`, unsliced has only `*_char.stl`. Same for plexi STL and SVG. Verify zero-padding kicks in at `totalSlices >= 10`. Verify a piece with `plexi_collapsed` skips just that piece's plexi STL/SVG slots, not its shell.

- `manifest.test.ts` (extended): `buildReadme` includes the "Slicing" section when `cuts.length > 0`; section reports `maxPieceWidth`, each cut's `(x, angle)`, and per-component piece counts. Section absent when `cuts.length === 0`.

E2E (`tests/e2e/smoke.spec.ts`): extend with a slicing leg.

- Set `text = "OK"`, font Anton, large enough `letterHeight` and small enough `maxPieceWidth` that one cut is needed.
- Click **Suggest cuts** → assert one row appears in the controls.
- Trigger export → unzip → assert presence of `*_char.stl`, `*_char_slice-1.stl`, `*_char_slice-2.stl` (and the matching plexi STL/SVG variants). Assert the README contains a "Slicing" section.

What we do **not** test:

- WASM 2D boolean accuracy beyond the unit cases — already trusted via existing `merge.ts` coverage.
- The preview overlay (red cut lines) at pixel level — visual, covered by manual verification.
- Three.js display-rotation interaction with the cut lines — single-line `<group>` inheritance, verified once by inspection.

## Manual verification gates

Before merging:

- Type a 5-letter word in a script font, set `maxPieceWidth = wordWidth/2`, click Suggest → eyeball one red cut line at the midpoint.
- Edit that cut's angle to 15° → confirm the red line tilts and the cut crosses the geometry on a slant.
- Export, unzip, open one sliced shell STL in the slicer → confirm it fits the declared build volume and the cut face is planar.
- Set `cableHoleDiameter = 6` with `cableHoleAtEnds = true` and a 2-cut slice → confirm only the leftmost piece has a left-end power-entry hole and only the rightmost has a right-end hole; boundary cable holes between letters are unaffected.
- Set `mountShankDiameter = 4` with a 2-cut slice → confirm only the leftmost piece has a left keyhole and only the rightmost has a right keyhole; the middle piece has none.

## Scope cuts (NOT in v1)

- **Alignment pegs / sockets** for self-aligning butt joints. Pure butt + glue only.
- **Dovetail / tongue-and-rabbet / lap-joint** joinery. Same reason.
- **In-viewport drag handles** for cut planes. Cuts are edited only via the controls panel; the canvas overlay is read-only.
- **Auto-detection of "good" cut positions** (narrowest waist between glyphs, straight-skeleton-based cut suggestion). Suggest is naive equal-spacing; user nudges manually.
- **Font-driven default angles** (reading the font's italic angle from opentype metadata). Default is always 0°. The user types the angle.
- **Per-letter cut overrides** or **Y-axis cuts**. X-axis vertical cuts only.
- **Per-cut joinery selection**. Joinery is global (butt + glue, always).
- **Preview of sliced pieces** (showing the separated meshes laid out flat on the build plate). Preview is always the assembled word; sliced pieces are export-only in v1.
- **Build-volume Y and Z constraints**. The single `maxPieceWidth` only constrains X. Y is the letter height (user-controlled directly); Z is `totalDepth + backCavityDepth` (user-controlled directly). If those exceed the printer, the user adjusts those values directly — slicing doesn't help.

## Files changed

New:

- `src/geometry/slice.ts`
- `tests/unit/slice.test.ts`
- `tests/unit/suggest-cuts.test.ts`

Modified:

- `src/state/parameters.ts` — `maxPieceWidth`, `cuts`, `Cut` type
- `src/geometry/validate.ts` — `maxPieceWidth` and per-cut `angle` clamping
- `src/state/persistence.ts` — defaults in `migrate()`
- `src/geometry/worker.ts` — call `sliceComponent`, build per-piece, thread `outerEdges`, surface `SliceWarning`s
- `src/geometry/worker-client.ts` — `SlicedComponentMesh` and updated `BuildResult`
- `src/geometry/shell.ts` — accept optional `outerEdges` arg; default behaviour unchanged
- `src/geometry/mounts.ts` — honour `outerEdges.left` / `outerEdges.right` (skip whole side when false)
- `src/geometry/cable-holes.ts` — honour `outerEdges` for `cableHoleAtEnds` power-entry holes
- `src/ui/ControlsPanel.tsx` — new "Slicing" fieldset
- `src/ui/PreviewCanvas.tsx` — `<CutLines>` overlay
- `src/exporters/zip.ts` — extended `bundleAll` signature + slice file emission
- `src/exporters/manifest.ts` — "Slicing" README section
- `tests/unit/parameters.test.ts` — new defaults
- `tests/unit/validate.test.ts` — clamping rules
- `tests/unit/persistence.test.ts` — migration + round-trip
- `tests/unit/mounts.test.ts` — `outerEdges` suppression
- `tests/unit/cable-holes.test.ts` — `outerEdges` suppression for power-entry holes
- `tests/unit/zip.test.ts` — full + sliced bundle layout
- `tests/unit/manifest.test.ts` — README section
- `tests/e2e/smoke.spec.ts` — slicing leg
- `CLAUDE.md` — new "Slicing" section after "Bulb holes"

No changes to: `flatten.ts`, `scale.ts`, `layout.ts`, `merge.ts`, `bulb-holes.ts`, `skeleton.ts`, `manifold-init.ts`, `stl.ts`, `svg.ts`, `filename.ts`.
