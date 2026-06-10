# Cable Holes (Marquee Sub-project C) — Design Spec

Date: 2026-06-10

## Goal

Drill horizontal cylindrical cable channels through the side walls of letters so a single cable can route from one letter into the next. Plus optional power-entry holes on the leftmost and rightmost outer walls of the entire word for connection to a wall outlet. Builds on the rear cavity (sub-project A) so cables run inside the letter, not in the visible front cavity.

## Scope

In scope:
- Four new parameters: `cableHoleDiameter`, `cableHoleY`, `cableHoleZ`, `cableHoleAtEnds`.
- New helper `src/geometry/cable-holes.ts`: pure function that, given the layout, the per-glyph contour map, and the cable parameters, returns a list of cylinder specs in word-space.
- Extension of `buildLetterShell` to accept an optional `cableHoles` array and subtract each cylinder from the shell.
- Worker plumbing: compute the global hole list once, then per-component filter by X-bbox overlap and pass the filtered list to `buildLetterShell`.
- Updates to validation, persistence, README, controls panel, reproduce URL, and tests.

Out of scope:
- Bulb holes through the front face (sub-project B).
- Mounting features (sub-project D).
- Per-pair hole control (every adjacent non-space pair gets the same hole).
- Two holes (top + bottom) per pair — single mid-letter hole only.
- Rectangular slot holes — circular only.
- Per-component power-entry: only the leftmost and rightmost letter of the entire text get end holes, regardless of how many space-separated runs the text has.
- Plexi geometry changes — `buildLetterPlexi` is unaffected (cable holes are inside the rear cavity, plexi sits at the front rabbet).

## User-visible behaviour

`cableHoleDiameter = 0` (default) disables the entire feature; geometry is identical to today's output. Setting `cableHoleDiameter > 0` enables it; holes appear at every adjacent non-space letter pair (same adjacency rule as bridges) and, if `cableHoleAtEnds = true`, at the leftmost letter's left wall and rightmost letter's right wall.

For "BAR" with `cableHoleDiameter = 8`, default `cableHoleAtEnds = true`, default rear cavity 20mm:
- Cylinder centered at the B-A boundary X, at Y = `letterHeight / 2`, Z = 10 (mid-rear-cavity), pierces B's right wall and A's left wall.
- Cylinder centered at the A-R boundary X, same Y/Z, pierces A's right wall and R's left wall.
- Cylinder centered at B's leftmost X (power entry), pierces B's left wall.
- Cylinder centered at R's rightmost X (power exit), pierces R's right wall.
- A continuous cable can route outside → B → A → R → outside.

For "B AR" with the same params:
- B-A is NOT drilled (space between them — same adjacency rule as bridges).
- A-R IS drilled.
- Power entry at B's left wall, power exit at R's right wall.
- Result: B has only its left wall holed (a stub for an isolated cable run into B). A has only its right wall holed. R has left and right holes. The user accepts this and either removes the space, adds a bridge, or wires B separately externally.

## Parameters

Added to `Parameters` in `src/state/parameters.ts`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `cableHoleDiameter` | number (mm) | `0` | finite; `≥ 0` |
| `cableHoleY` | number (mm) | `letterHeight / 2` | finite |
| `cableHoleZ` | number (mm) | `backCavityDepth / 2` | finite |
| `cableHoleAtEnds` | boolean | `true` | (boolean — no numeric check) |

Defaults are computed at parameter initialization time from `DEFAULT_LETTER_HEIGHT` and a new constant `DEFAULT_BACK_CAVITY_DEPTH = 20` extracted from the existing `backCavityDepth: 20` literal in `DEFAULT_PARAMETERS`. Like `bridgeY`, the defaults do not auto-update when `letterHeight` or `backCavityDepth` change at runtime — once a user has touched `cableHoleY` or `cableHoleZ`, their value is preserved.

`persistence.ts` `migrate()` adds defaults for old saved URLs/localStorage. The `typeof out.cableHoleAtEnds !== "boolean"` guard preserves a saved `false`. The `typeof !== "number"` guard preserves a saved `0`.

The reproduce URL serialization in `ExportButtons.tsx` adds the four fields. The README parameter dump prints four new lines (see README section).

## Geometry

### Cable hole helper (`src/geometry/cable-holes.ts`, new file)

```ts
import type { LayoutEntry } from "./layout";
import type { GlyphContours } from "./types";

export type CableHole = {
  x: number;       // word-space X
  y: number;       // word-space Y
  z: number;       // word-space Z
  diameter: number;
  length: number;  // cylinder length along the X axis
};

export type CableHoleParams = {
  cableHoleDiameter: number;
  cableHoleY: number;
  cableHoleZ: number;
  cableHoleAtEnds: boolean;
  wallThickness: number;
};

export function computeCableHoles(
  layout: LayoutEntry[],
  glyphContours: Map<number, GlyphContours>,
  params: CableHoleParams,
): CableHole[];
```

Behavior:
- If `params.cableHoleDiameter <= 0`, return `[]` (feature disabled).
- If `layout.length === 0`, return `[]`.
- Compute per-entry word-space X bbox `{minX, maxX}` from the contours: iterate `glyphContours.get(entry.originalIndex)`'s polygons, find min/max X over all points, then add `entry.xOffset`. Skip entries whose contour map yields nothing.
- For each pair of consecutive entries `(layout[i], layout[i+1])` where `layout[i+1].originalIndex - layout[i].originalIndex === 1` (adjacency rule, identical to bridges), emit one boundary cylinder:
  - `gap = bbox[i+1].minX - bbox[i].maxX` (positive when separate, negative when overlapping)
  - `x = (bbox[i].maxX + bbox[i+1].minX) / 2` (midpoint, in word space)
  - `length = max(|gap| + 4 * wallThickness, 4 * wallThickness)`
  - `y = params.cableHoleY`, `z = params.cableHoleZ`, `diameter = params.cableHoleDiameter`
- If `params.cableHoleAtEnds`:
  - Take the first valid bbox (`first`) and the last valid bbox (`last`) — these are the leftmost and rightmost visible letters of the entire text, ignoring spaces.
  - Emit a power-entry cylinder at `x = first.minX`, length `4 * wallThickness`, same Y/Z/diameter.
  - Emit a power-exit cylinder at `x = last.maxX`, length `4 * wallThickness`, same Y/Z/diameter.
  - When there is exactly one letter, `first === last`, so the two emitted cylinders sit at the only letter's left and right walls. Both walls of the single letter are pierced.

### Cylinder length rationale

A boundary cylinder centered at the midpoint between letter i and letter i+1 must pierce:
- Letter i's right wall (occupies X ∈ [`bbox[i].maxX - wallThickness`, `bbox[i].maxX`]).
- Letter i+1's left wall (occupies X ∈ [`bbox[i+1].minX`, `bbox[i+1].minX + wallThickness`]).

Centered at the midpoint with length `|gap| + 4 * wallThickness` gives 2·wallThickness margin past each target wall — comfortably piercing both while staying inside typical letter widths. For very narrow letters or thin stems where the cylinder would also pierce the opposite wall of the same letter, we accept the all-the-way-through hole — that's a fine cable channel anyway.

For overlapping letters (gap < 0), the formula reduces to `max(|gap| + 4·wallThickness, 4·wallThickness)`, preventing zero or negative lengths when the overlap is heavy. The cylinder still drills through the joining material at the boundary X.

### `buildLetterShell` extension (`src/geometry/shell.ts`)

`ShellInputs` gains `cableHoles?: CableHole[]`. The new step happens after the existing rear-cavity subtraction, just before mesh extraction:

```ts
// (after the existing shell construction; `shell` is the current Manifold)
if (input.cableHoles && input.cableHoles.length > 0) {
  for (const hole of input.cableHoles) {
    if (hole.diameter <= 0) continue;
    // Build a Z-axis cylinder of height = hole.length, radius = hole.diameter/2.
    // Use whichever manifold-3d API is most convenient — either Manifold.cylinder
    // (height, radius, radius, undefined, true /* center */) if available, or
    // CrossSection.circle(radius).extrude(height) followed by translate(-length/2)
    // to center it.
    // Then rotate 90° around the Y axis so the cylinder axis aligns with X,
    // translate to (hole.x, hole.y, hole.z), and subtract from the shell.

    const cyl = /* Z-cylinder centered on origin, length = hole.length, radius = hole.diameter/2 */;
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

const mesh = shell.getMesh();
// ... existing mesh copy + .delete() ...
```

Every intermediate Manifold (`cyl`, `cylX`, `cylPositioned`, the previous `shell`) is `.delete()`-ed inside the loop iteration that creates it, per CLAUDE.md's WASM lifecycle rule.

When `cableHoles` is empty or `undefined`, the loop body is skipped and the geometry is byte-equivalent to before.

The `buildLetterPlexi` function is unchanged. Cable holes never affect the plexi geometry.

### WASM lifecycle

Per cable hole that is actually applied: 3 new Manifold allocations (`cyl`, `cylX`, `cylPositioned`) plus 1 reassigned `shell`, all `.delete()`-ed inline before the next iteration. The previous `shell` Manifold is also deleted (since the chain `shell.subtract(...)` returns a new instance). No leaks.

## Worker plumbing (`src/geometry/worker.ts`)

After the existing `mergeIntoComponents` call:

```ts
const allCableHoles = computeCableHoles(layout, contoursByIndex, {
  cableHoleDiameter: req.params.cableHoleDiameter,
  cableHoleY: req.params.cableHoleY,
  cableHoleZ: req.params.cableHoleZ,
  cableHoleAtEnds: req.params.cableHoleAtEnds,
  wallThickness: req.params.wallThickness,
});
```

Then in the per-component loop, filter to holes whose X range overlaps the component's X bbox:

```ts
for (const comp of merged.components) {
  const componentMinX = comp.bbox.minX;
  const componentMaxX = comp.bbox.maxX;
  const cableHoles = allCableHoles.filter((h) => {
    const holeMinX = h.x - h.length / 2;
    const holeMaxX = h.x + h.length / 2;
    return holeMaxX >= componentMinX && holeMinX <= componentMaxX;
  });

  const meshResult = await buildLetterShell({
    contours: comp.mergedContours,
    totalDepth: req.params.totalDepth,
    backThickness: req.params.backThickness,
    wallThickness: req.params.wallThickness,
    rabbetDepth: req.params.rabbetDepth,
    insetWidth: req.params.insetWidth,
    backCavityDepth: req.params.backCavityDepth,
    cableHoles,
  });
  // ...
}
```

For separate components (default behaviour, per-letter), each boundary cylinder gets passed to BOTH adjacent components (since both component bboxes overlap the cylinder X range). Each component carves its own wall.

For merged components (overlap or bridge), the boundary cylinder passes to the single merged component and carves a tunnel through the joining material.

## Worker contract (`src/geometry/worker-client.ts`)

`plainParams: Parameters` literal adds the four new fields. No type-shape changes to `BuildResult` or `ComponentMesh` — cable holes are an input-only concept; the output is just the shell mesh with the holes already carved in.

## Validation (`validate.ts`)

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
// cableHoleAtEnds: no validation needed (boolean type-checked at parse time).
```

No upper bounds. Out-of-letter Y or Z values produce no-op cylinders (the manifold subtraction does nothing if the cylinder doesn't intersect the shell). The user gets to dial them anywhere.

## Persistence (`persistence.ts`)

`migrate()` adds:

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

The `typeof !== "number"` / `typeof !== "boolean"` guards preserve falsy-but-valid saved values (`0`, `false`).

The `ser` literal in `initPersistence` adds the four fields.

## README (`buildReadme` in `src/exporters/manifest.ts`)

Add four lines after `Back cavity depth:`. Use labels that fit the existing 18-char label column:

```
  Cable hole dia:    ${params.cableHoleDiameter} mm
  Cable hole Y:      ${params.cableHoleY} mm
  Cable hole Z:      ${params.cableHoleZ} mm
  Cable hole ends:   ${params.cableHoleAtEnds ? "yes" : "no"}
```

Pad the trailing spaces so values align in the same column as the existing rows (label + spaces = 19 chars before the value). The implementer counts exactly when wiring them in.

The file-tree section is unchanged.

## UI (`ControlsPanel.tsx`)

A new fieldset "Cable holes" between "Bridges" and any existing later section. Four controls:

```tsx
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
<label className="checkbox-row">
  <input
    type="checkbox"
    checked={params.cableHoleAtEnds}
    onChange={(e) => params.set({ cableHoleAtEnds: e.target.checked })}
  />
  Power-entry holes on outer ends
</label>
```

If `ControlsPanel.tsx` does not already contain a `<label className="checkbox-row">…<input type="checkbox">` pattern, the implementer can use the simplest equivalent (raw `<label>` + `<input>` styled to match the panel). No new shared components needed.

## Preview

No code changes in `PreviewCanvas.tsx` or `PreviewLetter.tsx`. The shell mesh now has hole geometry baked into it; the preview shader renders it correctly out of the box.

The plexi preview is unchanged (cable holes don't affect plexi).

## Export

No filename, folder, or layout changes. The shell mesh in each STL has the cable holes carved into it. Slicers see them as part of the shell geometry.

The reproduce URL serialization in `ExportButtons.tsx`'s `buildReproduceUrl` `serializable` object adds the four fields.

## Bridges interaction

Cable holes have no special handling for bridges. If a bridge sits at the same Y as `cableHoleY`, the cable cylinder pierces the bridge bar at the cable's Y/Z position — a tunnel is carved through the bridge. This is fine (cable can run through the bridge). If the bridge Y is far from the cable Y, no interaction. The user is responsible for choosing compatible Y values; no validation enforced.

## Connected-mode (overlap/bridge) interaction

When two letters are merged into one component (via overlap or bridge), `mergeIntoComponents` produces a single component with merged contours. The boundary cable cylinder is still computed at the X midpoint between the two letters' original (pre-merge) bboxes. The cylinder X-bbox almost certainly overlaps the merged component's X-bbox (since the boundary X is between them), so the cylinder is passed to the merged component's `buildLetterShell` call and subtracted from the merged shell. Net effect: a horizontal tunnel through the joining material.

This is the same code path as separate components — the worker's per-component bbox filter and `buildLetterShell`'s subtract loop don't care whether the component contains 1 or N letters.

## Tests

### `tests/unit/geometry/cable-holes.test.ts` (new)

- Returns `[]` when `cableHoleDiameter = 0`.
- Returns `[]` when `layout = []`.
- Single boundary hole between two adjacent non-space letters; verifies X = midpoint, length formula, Y/Z/diameter.
- No boundary hole between letters separated by a space (skips when `originalIndex` gap > 1).
- Two power-entry holes when `cableHoleAtEnds = true`, one at first.minX, one at last.maxX.
- No power-entry holes when `cableHoleAtEnds = false`.
- Single-letter input with `cableHoleAtEnds = true` produces two cylinders (one at left edge, one at right edge of the only letter).
- Overlapping letters (negative gap): cylinder length is at least `4 * wallThickness`, midpoint X is computed correctly.

### `tests/unit/geometry/shell.test.ts`

- New: `cableHoles = []` → mesh equivalent to existing behaviour (today's triangle count).
- New: `cableHoles = [{ ... }]` with a single hole that intersects the shell → mesh has more triangles than the no-hole case (smoke test that the subtraction had an effect).
- New: `cableHoles` with a hole whose X is far outside the shell's X bbox → mesh equivalent to the no-hole case (no-op subtraction).
- Existing tests updated to pass `cableHoles: []` (or omit the optional field) where applicable.

### `tests/unit/state/parameters.test.ts`

- Defaults include `cableHoleDiameter: 0`, `cableHoleY: 100` (letterHeight/2), `cableHoleZ: 10` (backCavityDepth/2), `cableHoleAtEnds: true`.

### `tests/unit/state/persistence.test.ts`

- `migrate()` fills `cableHoleDiameter: 0` when missing.
- `migrate()` fills `cableHoleY` from `letterHeight / 2` when missing (with explicit `letterHeight`).
- `migrate()` falls back to `DEFAULT_PARAMETERS.letterHeight / 2` for `cableHoleY` when `letterHeight` is also missing.
- `migrate()` fills `cableHoleZ` from `backCavityDepth / 2` when missing (with explicit `backCavityDepth`).
- `migrate()` falls back to `DEFAULT_PARAMETERS.backCavityDepth / 2` for `cableHoleZ` when `backCavityDepth` is also missing.
- `migrate()` fills `cableHoleAtEnds: true` when missing.
- Preserves an explicit `cableHoleDiameter` value (e.g. 8).
- Preserves `cableHoleDiameter: 0` (falsy but valid — same pattern as `plexiTolerance: 0`).
- Preserves `cableHoleAtEnds: false` (falsy boolean).

### `tests/unit/geometry/validate.test.ts`

- Accepts default values.
- Rejects negative `cableHoleDiameter`.
- Rejects NaN for any of `cableHoleDiameter`, `cableHoleY`, `cableHoleZ`.
- Accepts `cableHoleDiameter: 0` (disabled).
- Accepts arbitrary positive Y / Z values (no bounds).

### `tests/unit/exporters/manifest.test.ts`

- README contains `Cable hole dia:`, `Cable hole Y:`, `Cable hole Z:`, `Cable hole ends:` lines.
- `Cable hole ends:` value is `yes` when `cableHoleAtEnds = true`, `no` when `false`.

### `tests/e2e/smoke.spec.ts`

- No assertion changes needed. The smoke test exercises a successful build → zip download with explicit params; cable holes default to disabled (`diameter = 0`), so the shipping geometry is unchanged.

## Files touched

Created:
- `src/geometry/cable-holes.ts`
- `tests/unit/geometry/cable-holes.test.ts`

Modified:
- `src/state/parameters.ts` — four new fields, defaults; new `DEFAULT_BACK_CAVITY_DEPTH` constant.
- `src/state/persistence.ts` — migrate fills the new fields; `ser` literal adds them.
- `src/geometry/validate.ts` — bounds checks for the three numeric fields.
- `src/geometry/shell.ts` — `ShellInputs.cableHoles?`, subtract loop in `buildLetterShell`.
- `src/geometry/worker.ts` — `computeCableHoles` call after merge; per-component bbox filter; pass `cableHoles` to `buildLetterShell`.
- `src/geometry/worker-client.ts` — `plainParams` includes the four new fields.
- `src/exporters/manifest.ts` — README parameter lines.
- `src/ui/ControlsPanel.tsx` — new "Cable holes" fieldset with three NumberFields and one checkbox.
- `src/ui/ExportButtons.tsx` — `buildReproduceUrl` `serializable` adds the four fields.
- `tests/unit/geometry/shell.test.ts`
- `tests/unit/state/parameters.test.ts`
- `tests/unit/state/persistence.test.ts`
- `tests/unit/geometry/validate.test.ts`
- `tests/unit/exporters/manifest.test.ts`

CLAUDE.md updates (after implementation):
- New "Cable holes" section between "Back cavity" and "NumberField behaviour".
- Spec-list entry pointing to `2026-06-10-cable-holes-design.md`.
- Test count bumped to reflect the new tests.

## Acceptance

- All existing unit tests still pass with explicit values added where required.
- New `cable-holes.test.ts` passes.
- New shell tests pass (cable hole drilling smoke + no-op when out of range).
- E2E continues to pass.
- `npm run build` clean.
- A user with default params downloads geometry identical to today's (since `cableHoleDiameter = 0` disables the feature).
- A user setting `cableHoleDiameter = 8` on "BAR" gets four holes total: B-A boundary, A-R boundary, B-left power-entry, R-right power-exit. All at Y = `letterHeight / 2`, Z = `backCavityDepth / 2`. A continuous cable can be threaded outside → B → A → R → outside through the rear cavity.
- Setting `cableHoleAtEnds = false` removes only the leftmost-left and rightmost-right power holes; internal boundary holes remain.
- Setting `cableHoleDiameter > 0` on text containing a space (e.g. "B AR") drills only the A-R boundary plus the two power-entry holes; B-A is skipped (space adjacency rule).
