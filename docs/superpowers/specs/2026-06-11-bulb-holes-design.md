# Bulb holes — design

Date: 2026-06-11

## Problem

Marquee-letter signs typically host one or more small lightbulbs (E10/T-base sockets, candle bulbs) inside the front cavity, mounted to the back panel and facing the plexi diffuser. Today the generator produces a sealed back panel with no provisions for inserting bulb sockets. The user must drill the panel manually — error-prone, hard to align with stroke centers, and defeats the "everything in the STL" goal.

This feature adds a parameterised drill pass that punches Z-axis through-holes in the back panel, distributed along the medial-axis-like centerline of the letter's cavity. From the rear face the user inserts a bulb socket through each hole; the bulb head sits in the front cavity, the socket and wires sit in the rear cavity.

Out of scope: counterbore/countersink for socket shoulders, true medial-axis computation (Voronoi / straight skeleton), per-letter overrides, drilling guide SVGs, wiring channels between holes. See "Scope cuts" below.

## Centerline algorithm

Pure helper module `src/geometry/bulb-holes.ts`, mirroring the structure of `src/geometry/cable-holes.ts`:

```ts
export type BulbHole = { x: number; y: number; diameter: number };

export type BulbHoleParams = {
  bulbHoleDiameter: number;
  bulbHoleSpacing: number;
  bulbHoleInset: number;
  bulbHoleMaxCount: number;
  wallThickness: number;
};

export function computeBulbHoles(
  contours: GlyphContours,         // already-merged component contours, in word-space
  params: BulbHoleParams,
): { holes: BulbHole[]; warning?: "bulbhole_inset_collapsed" };
```

Algorithm:

1. Fast path: if `bulbHoleDiameter <= 0` return `{ holes: [] }`.
2. Build `outer = new CrossSection(contours, "NonZero")`.
3. `cavity = outer.offset(-wallThickness, "Round")` — same offset as `shell.ts` uses, so the centerline rides the printable cavity, not the raw glyph.
4. `centerline = cavity.offset(-bulbHoleInset, "Round")`.
5. If `centerline.isEmpty()` → delete intermediates, return `{ holes: [], warning: "bulbhole_inset_collapsed" }`.
6. Pull the centerline's polygons via `.toPolygons()`. The result is one or more closed rings:
   - Outer ring: a smaller version of the letter outline, sitting roughly at stroke-center.
   - Inner rings (zero or more): smaller versions of the counters (A's triangle, O's eye), each ringing a counter.
7. Compute arc length of each ring (sum of segment lengths around the polygon).
8. Determine per-ring hole count. Two constraints, take the smaller:
   - **Spacing**: `desiredCount = max(1, round(ringPerimeter / bulbHoleSpacing))`. The user's spacing is the target density.
   - **Cap share**: `capShare = round(bulbHoleMaxCount * ringPerimeter / totalPerimeter)`, with `max(1, ...)` floor so a tiny ring still gets at least one hole when the user has the feature on.
   - `holesForRing = min(desiredCount, capShare)`.
   This way `bulbHoleSpacing` controls density when the cap is generous; the cap kicks in only when the user wants very dense placement on long perimeters.
9. Walk the ring at uniform arc-length intervals: `step = ringPerimeter / holesForRing`. Emit a hole every `step` mm starting at the ring's first vertex, linearly interpolating `(x, y)` between adjacent polygon vertices.
10. Edge case: if `ringPerimeter < bulbHoleSpacing` AND `holesForRing == 1`, the single hole is placed at the ring's centroid instead of its first vertex (avoids clustering all rings' first holes near the polygon's start vertex).
11. Delete `outer`, `cavity`, `centerline`. Return `{ holes }`.

The walk runs in JS once `toPolygons()` returns the vertex arrays — no further WASM allocations per hole. Every `CrossSection` is named and `.delete()`-ed; the helper holds no manifold references after return.

## Shell drilling

`src/geometry/shell.ts`:

- Extend `ShellInputs`:
  ```ts
  bulbHoles?: ReadonlyArray<BulbHole>;
  ```
- Add a drilling loop **after** the cable-hole loop and **before** the mount block. Order matters because mounts subtract keyhole shapes from the back panel; running bulb holes first keeps the two operations independent (a bulb hole that lands inside the keyhole footprint still produces a clean through-hole, the keyhole subtraction simply has nothing extra to remove).
- Each hole becomes a Z-axis cylinder:
  - `length = backThickness + 2·ε` (ε = 0.01 mm, ensures a clean through-pass even with floating-point error)
  - radius = `hole.diameter / 2`
  - centred at `Z = backCavityDepth + backThickness/2`
  - translated to `(hole.x, hole.y, ...)` in word space
- For flat-back (`backCavityDepth = 0`): the cylinder pierces the back panel directly. Bulb is inserted from outside the letter (rear face) into the front cavity.
- For open-back (`backCavityDepth > 0`): the cylinder pierces the internal partition. Bulb is inserted by reaching through the open rear cavity and pushing the socket into the partition holes.
- Every `Manifold.cylinder`, `.translate(...)`, intermediate `Manifold` is named and `.delete()`-ed inline, mirroring the cable-hole loop. The shell is reassigned at each iteration via `subtract`; the prior shell is deleted.

No change to plexi geometry. Bulb holes don't affect the plexi mesh, the cut sheet, or the rabbet.

## Worker integration

`src/geometry/worker.ts`:

- After `computeCableHoles` and `computeMounts`, call `computeBulbHoles(component.mergedContours, params)` per component.
- Pass `holes` to `buildLetterShell`.
- If the helper returns a `warning`, push it onto the component's warnings array using the existing `WorkerWarning` channel — same as `bridge_disconnected`, `offset_collapsed`, `mount_slot_outside_range`.

`src/geometry/worker-client.ts`:

- Re-export `BulbHole` and the params via `import type`. The worker imports them too (`import type` only; verbatimModuleSyntax compliance).

Already-merged contours are used (the same `mergedContours` already passed to `computeCableHoles` and `computeMounts`). Connected-mode works automatically: when letters merge into one component, the centerline is one continuous path through the merged shape, holes flow across the join.

## Parameters

`src/state/parameters.ts`:

```ts
bulbHoleDiameter: number;   // default 0 (disabled)
bulbHoleSpacing: number;    // default 30 mm
bulbHoleInset: number;      // default = DEFAULT_WALL_THICKNESS (10 mm)
bulbHoleMaxCount: number;   // default 12 per component
```

Validation (in `src/geometry/validate.ts`, surfaced as field errors in the controls):

- `bulbHoleDiameter >= 0`
- `bulbHoleSpacing > 0`
- `bulbHoleInset > 0`
- `bulbHoleMaxCount >= 1` and integer

The geometric "inset is too large for this cavity" check is intentionally NOT a parameter-level validation — it depends on the actual letter shapes and font. It's caught at compute time via `centerline.isEmpty()` and surfaced as a per-component `bulbhole_inset_collapsed` warning. The user adjusts `bulbHoleInset` downward and re-renders.

## Persistence

`src/state/persistence.ts`:

- New fields are added to the persisted JSON automatically.
- No `migrate()` rule needed: old saves without these fields default to the `DEFAULT_PARAMETERS` values when restored. Crucially, `bulbHoleDiameter = 0` keeps the feature off, so geometry stays identical to today for any pre-existing URL or localStorage entry.

## UI

`src/ui/Controls.tsx` (or wherever the existing param sections live — match the file currently hosting the "Cable holes" / "Mounts" sections):

- New collapsible section "Bulb holes", after "Mounts."
- Four `NumberField`s: Diameter (mm), Spacing (mm), Inset (mm), Max per component.
- The diameter field is the on/off switch. When `bulbHoleDiameter = 0` the helper short-circuits and no holes are drilled, even if the other fields hold values. Other fields stay editable so the user can dial them in before turning the feature on.
- Help text on the Inset field: "Distance from cavity edge inward to the centerline. Smaller = closer to walls; larger = closer to letter center. Try ~wallThickness."

## Preview

No new render path. The bulb holes appear as voids in the existing shell mesh, visible through the open back (open-back mode) or the back face (flat-back mode). Three.js renders the holes for free. No HUD, no overlay, no diff visualisation in v1.

## Exports

- **STL** (`src/exporters/stl.ts`): no change. Holes are part of the shell mesh.
- **SVG** (`src/exporters/svg.ts`): no change. Bulb holes don't affect the plexi cut sheet.
- **README** (`src/exporters/manifest.ts` → `buildReadme`): add a "Bulb holes" subsection when `bulbHoleDiameter > 0`, listing diameter, spacing, inset, and the max-count cap.
- **Zip layout** / **filename**: no change.

## Tests

Unit tests under `tests/unit/`, mirroring existing structure:

- `bulb-holes.test.ts` (new):
  - Rectangle cavity → holes evenly spaced along the inner ring's perimeter; positions match arc-length walk to within ε.
  - Cap respected: setting `bulbHoleMaxCount = 3` on a long letter returns 3 holes with proportionally larger spacing.
  - Two rings (rectangle with a square hole = cavity-with-counter): cap distributes proportionally to ring perimeter.
  - `bulbHoleInset` > available cavity half-width: returns `{ holes: [], warning: "bulbhole_inset_collapsed" }`.
  - `bulbHoleDiameter = 0` returns `{ holes: [] }` without allocating any CrossSection.
  - Tiny ring (perimeter < spacing): returns one hole at the ring's centroid.

- `shell.test.ts` (extended):
  - Small fixture rectangle letter + one bulb hole produces a shell mesh with one through-hole at the back panel; bbox unchanged; vertex count increases.
  - Flat-back (`backCavityDepth = 0`) and open-back (`backCavityDepth = 20`) both produce a through-hole at the expected Z range; the hole pierces only `[backCavityDepth, backCavityDepth + backThickness]`.
  - Bulb hole + cable hole at overlapping XY/Y/Z does not crash and produces a single merged void (sanity, not strict shape assertion).

- `parameters.test.ts`: new fields are present in `DEFAULT_PARAMETERS` with the documented values.
- `persistence.test.ts`: new fields round-trip through URL + localStorage; an old payload without these fields restores to defaults (i.e. disabled).
- `validate.test.ts`: invalid values (negative diameter, zero spacing, fractional max-count) produce field errors.

E2E: extend `tests/e2e/smoke.spec.ts` to set `bulbHoleDiameter = 8` once before download. Asserts the zip still has the expected layout (no exporter changes; this confirms the worker doesn't crash with the feature on for the bundled-font path).

## Edge cases

- **Inset collapse**: warning + no holes for that component. Already covered.
- **Spacing larger than ring perimeter**: place one hole at the ring's centroid. Small letters still get a single bulb.
- **Bulb hole sits on top of a cable hole**: both subtract from shell, the void merges. No special-case. Visual artefact is acceptable (printable, just cosmetically merged).
- **Bulb hole near a mount keyhole**: same merging behaviour. The mount block runs after bulb-hole drilling; the keyhole simply has nothing extra to remove from the already-pierced back panel inside its footprint.
- **Letter with no usable interior** (e.g. `i` dot at small heights, very thin letters): `centerline.isEmpty()`, warning emitted, no holes for that component. User adjusts inset or accepts no bulbs in that letter.
- **Connected components**: bulb holes follow the merged contours; a hole can land on the bridge bar or the overlap zone — that's fine, it's still real material to drill through.

## Scope cuts (NOT in v1)

- True medial-axis algorithm (Voronoi / straight skeleton). The offset-based centerline is good enough for typical sans-serif marquee letters. Revisit if uneven stroke widths produce noticeably off-centre holes.
- Snap-to-corners or per-stroke uniformity — uniform arc-length walk only.
- Per-letter override of count or spacing — global params, same as cable-holes and mounts.
- Counterbore / countersink for socket shoulders — flat-bottom hole only. User adjusts diameter to fit their socket spec.
- SVG layer for bulb-hole positions (drilling guides) — can add later if useful.
- Connection / wiring channels between holes — independent feature if ever needed.
- Per-component min-count (e.g. "always at least 2 holes per letter") — defer until requested.

## Files changed

New:
- `src/geometry/bulb-holes.ts`
- `tests/unit/bulb-holes.test.ts`

Modified:
- `src/geometry/shell.ts` — `ShellInputs` adds `bulbHoles`, drilling loop in body
- `src/geometry/worker.ts` — call `computeBulbHoles`, pass to shell, emit warnings
- `src/geometry/worker-client.ts` — re-export `BulbHole` type
- `src/state/parameters.ts` — four new params + defaults
- `src/geometry/validate.ts` — four new validations
- `src/ui/Controls.tsx` (or current home of the controls) — new "Bulb holes" section
- `src/exporters/manifest.ts` — README subsection
- `tests/unit/shell.test.ts` — through-hole assertions
- `tests/unit/parameters.test.ts` — defaults
- `tests/unit/persistence.test.ts` — round-trip
- `tests/unit/validate.test.ts` — field errors
- `tests/e2e/smoke.spec.ts` — feature-on smoke
- `CLAUDE.md` — add a "Bulb holes" section after "Mounting"

No changes to: `flatten.ts`, `scale.ts`, `layout.ts`, `merge.ts`, `cable-holes.ts`, `mounts.ts`, `manifold-init.ts`, plexi exports, SVG exporter, zip exporter, filename builder.
