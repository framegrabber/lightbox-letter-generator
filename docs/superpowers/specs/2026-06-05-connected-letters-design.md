# Connected Letters — Design Spec

Date: 2026-06-05

## Goal

Add a mode that merges adjacent letters into a single shell so a continuous LED strip can be routed through the interior cavity. Connection is achieved either by negative letter-spacing (overlap) or by an explicit bridge bar between adjacent letters. Both controls can be combined.

## Scope and non-goals

In scope:
- New parameters: letter overlap, bridge width/height/Y.
- A new 2D pre-merge stage in the geometry pipeline that produces one shell per connected component.
- Updated worker contract: components replace letters as the unit of work.
- Updated export filenames and README.

Out of scope:
- Dedicated LED channels, grooves, or floor cutouts. Continuous interior cavity is achieved purely by unioning the merged outline; no extra geometry is added for the strip.
- Per-letter STLs in connected mode. If two letters merge, they ship as one STL.
- Auto-routing the LED strip in the preview.
- Detecting overlaps that already exist in italic or script fonts and merging without an explicit param. The merge step always runs; with `letterOverlap = 0` and no bridge, naturally-touching glyphs would technically merge — that's acceptable behavior, not a feature.

## User-visible behavior

The mode is "always-on with zero defaults". No mode toggle in the UI. The new parameters default to values that reproduce today's per-letter behavior:

- Each letter exports as its own STL when `letterOverlap = 0` and no bridge is configured.
- Setting `letterOverlap > 0` pulls letters together until their outlines overlap, after which they merge into one STL per connected group.
- Setting `bridgeWidth > 0` and `bridgeHeight > 0` adds a horizontal bar between every consecutive non-space pair, merging them into a single component.

Spaces in the text always split connected components: overlap and bridges only apply between consecutive non-space glyph pairs.

## Parameters

Added to `Parameters` in `src/state/parameters.ts`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `letterOverlap` | number (mm) | `0` | `0 ≤ letterOverlap < letterHeight` |
| `bridgeWidth` | number (mm) | `0` | `bridgeWidth ≥ 0` |
| `bridgeHeight` | number (mm) | `0` | `bridgeHeight ≥ 0` |
| `bridgeY` | number (mm) | `-letterHeight / 2` | unconstrained |

`bridgeY` is the Y position of the bar's center, in word space. After `flatten.ts`'s Y-flip, glyphs span `Y ∈ [-letterHeight, 0]` (baseline at Y=0, top at Y=-letterHeight), so the default places the bar at mid-letter. The default is computed once at parameter initialization; it does not auto-update when `letterHeight` changes — that would override an intentional user value.

A bridge is added only when both `bridgeWidth > 0` and `bridgeHeight > 0`. If exactly one is zero, the bridge is silently disabled (no error, since the user is mid-edit).

The bridge bar's X extent is `[center − bridgeWidth/2, center + bridgeWidth/2]` where `center = (prev.maxX + next.minX) / 2`. `bridgeWidth` is the bar's total length. For the bar to actually connect, it has to extend into both letters by at least `wallThickness` — i.e. `bridgeWidth ≥ (next.minX − prev.maxX) + 2 × wallThickness`. If it's smaller, the bar floats in the gap and the merge step emits a `bridge_disconnected` warning for that pair (the bar is dropped, not added to the merge). With `letterOverlap > 0` the gap may be negative; any positive `bridgeWidth` then connects.

If a bridge is configured but does not actually touch a letter pair (e.g. `bridgeY` is far outside the letters' vertical range), the merge step reports a `bridge_disconnected` warning for that pair and the component split is unaffected. This is non-fatal.

### Persistence migration

`src/state/persistence.ts` `migrate()` adds default values for the four new fields when an old saved URL or localStorage entry is loaded. Existing keys are unchanged. The legacy `rabbetLipWidth → insetWidth` migration is preserved.

## Pipeline

Today: `flatten → scale → shell → layout → meshes`.

After: `flatten → scale → layout → **merge** → shell → meshes`.

`scale` and `flatten` are unchanged. `layout` gains a `letterOverlap` argument. `merge` is new. `shell` is unchanged in implementation but is now invoked once per component on a merged contour set, not once per letter.

### Layout change (`src/geometry/layout.ts`)

`layoutWord` signature gains a fourth argument `letterOverlap: number` (default 0). Inside the loop, after kerning is applied between glyphs `i` and `i+1`, the cursor is also reduced by `letterOverlap` mm — but only when neither glyph is a space.

```
cursorFu += kern;
if (!isCurrentSpace && !isNextSpace) {
  cursorFu -= (letterOverlap / scale); // overlap is in mm, cursor is in font units
}
```

`xOffset` for each non-space glyph already reflects the new cursor position; no further changes are needed downstream.

### Merge stage (`src/geometry/merge.ts`)

New file. Pure-function module. Imports `manifold-init` for `CrossSection`.

Public types:

```ts
export type ComponentMember = {
  char: string;
  index: number;     // original text index, including spaces
  xOffset: number;   // word-space X of the glyph origin
};

export type Component = {
  members: ComponentMember[];   // left-to-right order
  mergedContours: GlyphContours; // in word space, ready to shell
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export type MergeWarning = {
  kind: "bridge_disconnected";
  pair: [ComponentMember, ComponentMember];
};

export type MergeParams = {
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
  wallThickness: number;
};

export type MergeResult = {
  components: Component[];
  warnings: MergeWarning[];
};
```

Public function:

```ts
mergeIntoComponents(
  layout: LayoutEntry[],
  glyphContours: Map<number, GlyphContours>, // keyed by original index
  params: MergeParams
): Promise<MergeResult>
```

Algorithm:

1. **Translate to word space.** For each `layout` entry, translate its glyph contours by `(xOffset, 0)`. Build a list of `Item` records `{ kind: "letter", member, contours, bbox }`.
2. **Build bridges.** For each consecutive non-space pair where `bridgeWidth > 0` and `bridgeHeight > 0`, build a bridge rectangle as defined in Parameters. Append as `{ kind: "bridge", from, to, contours, bbox }`. Validate the bridge actually intersects both endpoints' glyphs (pairwise `CrossSection.intersect` non-empty); if not, emit a `bridge_disconnected` warning and **skip the bridge** (do not include it in the items list).
3. **Connectivity.** Build a union-find over letter items. For each pair of letter items whose bboxes intersect (cheap pre-filter), do a true `CrossSection.intersect` test; if non-empty, union. For each surviving bridge item, union its `from` and `to` letters.
4. **Materialize components.** Group letter items by union-find root, in left-to-right order of their leftmost member. For each group: collect the group's letter contours plus any bridge items that belong to letters in the group. **Fast path:** if the group has exactly one letter and no bridges, use that letter's translated contours directly as `mergedContours` (no `CrossSection` round-trip). Otherwise union them all into a single `CrossSection` (start from the first, repeated `.add()`), then read back the polygons as `mergedContours`. Compute bbox from the polygon vertices. Push a `Component` whose `members` are the letter members in left-to-right order by `xOffset`.
5. **Cleanup.** Every `CrossSection` allocated (translated glyphs, bridge rects, intersect probes, intermediate unions) is `.delete()`-ed including chained intermediates. CLAUDE.md's WASM-lifecycle rule is mandatory here.

If `glyphContours` lacks an entry for a layout member (glyph load failed upstream), that letter is skipped silently — it doesn't anchor a component.

If any merge step throws (manifold WASM failure), the function rejects; `worker.ts` propagates the error so `usePreviewBuild`'s `try/catch/finally` resets `busy`.

#### API risk

manifold-3d's API for reading polygons back out of a unioned `CrossSection` is `.toPolygons()` per current docs. If that returns a structure incompatible with our `GlyphContours` shape, the implementer falls back to extruding the unioned `CrossSection` directly and threading the unioned `CrossSection` (instead of `mergedContours`) through to `shell.ts`. Either way the outer behavior is the same; this is an internal fallback noted now to avoid surprise.

### Shell stage (`src/geometry/shell.ts`)

Unchanged. Still takes a `GlyphContours` and produces a shell. The merged contour set has the same shape — it's just multiple polygons that happen to be the union of several glyph outlines.

The same applies to `buildLetterPlexi`: it operates on the merged contours, producing one plexi mesh per component.

## Worker contract

Canonical types remain in `src/geometry/worker-client.ts`. `worker.ts` imports them via `import type`.

`LetterMesh` is renamed `ComponentMesh`:

```ts
export type ComponentMesh = {
  members: { char: string; index: number }[]; // left-to-right
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  xOffset: number; // component minX in word space, before per-component centering
  plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null;
};
```

`LetterLayers` becomes `ComponentLayers`, keyed the same way (members[]).

`LetterError` becomes `ComponentError`. Reasons unchanged: `offset_collapsed | no_contours`. The error carries `members` instead of a single `char`/`index`.

`WorkerResponse` becomes:

```ts
{
  requestId: string;
  components: ComponentMesh[];
  layers: ComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};
```

Transferables list grows with the components array (vertProperties + triVerts buffers per component, plus plexi buffers).

## Worker implementation (`src/geometry/worker.ts`)

Restructured outer loop:

1. Parse font, compute scale.
2. Build a `Map<number, GlyphContours>` of flattened+scaled contours per **original index** for every non-space glyph in the text.
3. Call `layoutWord(font, text, letterHeight, letterOverlap)`.
4. Call `mergeIntoComponents(layout, contoursByIndex, mergeParams)`.
5. For each `Component`:
   - `buildLetterShell({ contours: component.mergedContours, ... })`. On `ok: false`, push a `ComponentError` with `members`.
   - `centerMeshXY` the result. Record `cx, cy`.
   - `buildLetterPlexi({ contours: component.mergedContours, ... })`. Apply the same `cx, cy` shift the shell got, so the plexi mesh aligns with its shell.
   - Push a `ComponentMesh` with `xOffset = component.bbox.minX`.
   - `buildLetterLayers({ contours: component.mergedContours, ... })` for the SVG layers used in plexi export.
6. Post the response with all transferables.

The per-letter centering compensation that today's `PreviewLetter` does (`xOffset + cx, cy`) still applies, but at the component level. The component's `xOffset` is its leftmost member's word-space X, and `cx, cy` is the shift `centerMeshXY` applied. World position becomes `(xOffset + cx, cy, 0)`.

## Preview (`src/ui/PreviewCanvas.tsx`, `PreviewLetter.tsx`)

`PreviewCanvas` iterates `components` instead of `letters`. The "look up by `Array.from(text)` index" pattern still works: each component lists its `members[].index`, so per-letter highlighting (if reintroduced) still has a path. The component itself is rendered as a single mesh — same `MeshStandardMaterial` and shading, same `toNonIndexed → computeVertexNormals` flow.

Plexi rendering is the same `MeshPhysicalMaterial` setup, applied to the per-component plexi mesh. `depthWrite: false` is preserved.

`showPlexi` toggle still applies, globally.

Auto-fit camera (top of `PreviewCanvas.tsx`) operates on the union of component bboxes, not letter bboxes — same code path, just feeding it components.

## Export

`src/exporters/zip.ts` `bundleAll(stls, plexis, readme)` is unchanged in shape; the inputs are now per-component instead of per-letter.

Filenames change:

- `stl/01_<chars>.stl` — `<chars>` is the joined member chars in left-to-right order, sanitized to `[A-Za-z0-9_-]` (whitespace stripped, non-matching chars dropped). Index is the component's left-to-right order, 1-based, two-digit zero-padded.
- `plexi/01_<chars>.svg` — same scheme.
- If sanitization produces an empty string (e.g. all members are non-ASCII), fall back to `01_component.stl`.

`buildReadme(params, reproduceUrl)` adds:

- The four new params under the existing parameter list.
- A new "Pieces" section listing each component with its 1-based index, the joined member chars, and the count of glyphs in it.

The README still serves as the authoritative human-readable manifest. No `manifest.json` is reintroduced.

## Validation (`src/geometry/validate.ts`)

New rules:
- `letterOverlap`: number, finite, `≥ 0`, `< letterHeight`.
- `bridgeWidth`: number, finite, `≥ 0`.
- `bridgeHeight`: number, finite, `≥ 0`.
- `bridgeY`: number, finite (no bound).

Existing rules untouched.

## Errors and warnings

| Source | Reason | Surface |
|---|---|---|
| Shell offset collapse on a component | `ComponentError { reason: "offset_collapsed", members }` | UI error list, names the affected chars |
| Empty merged contours (every glyph in a layout failed to load) | `ComponentError { reason: "no_contours", members }` | Same |
| Bridge configured but doesn't touch its endpoints | `MergeWarning { kind: "bridge_disconnected", pair }` | UI warning list, non-blocking |
| Worker exception | rejected promise → caught in `usePreviewBuild` | "Generating…" reset; toast |

The `usePreviewBuild` `try/catch/finally` from CLAUDE.md is unchanged but load-bearing.

## Tests

Mirror new code under `tests/unit/`.

- `merge.test.ts`:
  - No overlap, no bridge → N components for an N-letter word.
  - `letterOverlap` large enough to merge two letters → 1 component, members in order.
  - `letterOverlap` partial — first two merge, third doesn't → 2 components.
  - Bridge configured between two letters → 1 component.
  - Bridge configured but `bridgeY` outside both letters → still 2 components, one `bridge_disconnected` warning.
  - Spaces in the text always split components, even with high `letterOverlap`.
  - WASM cleanup: assert no leaked `CrossSection`s by counting allocations vs deletes (manifold-3d exposes a `getMemoryUsage` or counter; if not, this assertion is omitted and we lean on review).
- `layout.test.ts`: extend with a `letterOverlap > 0` case asserting the cursor is reduced for non-space pairs only.
- `validate.test.ts`: bounds for the four new params.
- `parameters.test.ts` / `persistence.test.ts`: `migrate()` fills new fields with defaults from an old saved URL.
- E2E smoke (`tests/e2e/smoke.spec.ts`): set `letterOverlap` so the test text becomes a single component; assert the zip contains exactly one STL with the new joined-name scheme and no per-letter STLs. Continue asserting `stl/`, `plexi/`, `README.txt`, no `manifest.json`.

## Files touched

New:
- `src/geometry/merge.ts`
- `tests/unit/geometry/merge.test.ts`

Modified:
- `src/state/parameters.ts` — four new fields, defaults
- `src/state/persistence.ts` — `migrate()` fills new fields
- `src/geometry/types.ts` — possibly `Component`/`ComponentMember` if not co-located in `merge.ts`
- `src/geometry/layout.ts` — `letterOverlap` argument
- `src/geometry/worker.ts` — restructured for components
- `src/geometry/worker-client.ts` — renamed types, new fields, warnings array
- `src/geometry/validate.ts` — new bounds
- `src/ui/PreviewCanvas.tsx` — iterate components
- `src/ui/PreviewLetter.tsx` — rename file (or its component) to PreviewComponent; same rendering; or keep filename to minimize churn
- `src/ui/Controls.tsx` (or wherever the params panel lives) — four new fields
- `src/exporters/zip.ts` — filename scheme based on component members
- `src/exporters/manifest.ts` (now `buildReadme`) — Pieces section, new params
- `tests/unit/geometry/layout.test.ts`, `validate.test.ts`, `state/persistence.test.ts`, `state/parameters.test.ts`
- `tests/e2e/smoke.spec.ts`

## WASM lifecycle reminder

`src/geometry/merge.ts` is allocation-heavy. CLAUDE.md is explicit: every `CrossSection` and `Manifold` must be `.delete()`-ed, **including intermediate results of chained operations**. `getMesh()` views must be copied with `.slice()` before any deletion. The implementer must keep every intermediate allocation in a named variable and delete it in a `finally` block (or equivalent) so a thrown exception during merge does not leak WASM heap.

## Acceptance

- All existing Vitest tests still pass.
- New `merge.test.ts` cases pass.
- E2E smoke passes with both default params (no merging) and a configured `letterOverlap` (one merged STL).
- `npm run lint` clean.
- Today's defaults produce behaviorally equivalent output: one STL per letter, same characters in the same positions, same plexi pieces. The mesh data may differ at floating-point precision (since translation now happens in 2D before extrusion instead of at mesh level), but no shape, count, or filename differences.
- A user can set `letterOverlap > 0` or configure a bridge in the UI, see the merged shell in the preview, and download a zip with one STL per connected component.
