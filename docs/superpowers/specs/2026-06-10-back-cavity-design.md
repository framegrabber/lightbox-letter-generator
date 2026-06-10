# Back Cavity (Marquee Letter Foundation) — Design Spec

Date: 2026-06-10

## Goal

Extend each letter shell with a hollow rear cavity behind the existing back panel, open at the very back, so the user has space to mount LEDs / wiring / power supplies inside the letter and access them from behind. Foundation for marquee-style letters; subsequent sub-projects (bulb holes, side-wall pass-through holes, mounting features) build on top.

## Scope

In scope:
- New parameter `backCavityDepth` (mm, default `20`).
- Geometry change: the perimeter wall extends backward by `backCavityDepth`. The existing back panel becomes an internal panel separating two cavities (front cavity for LED/plexi diffusion, rear cavity for electronics). Open at the very back.
- Coordinate system change: Z=0 at the open back (lowest face); Z=`totalDepth + backCavityDepth` at the front face.
- Updates to `buildLetterShell`, `buildLetterPlexi`, worker payload, validation, persistence, README, and tests.

Out of scope:
- Bulb holes through the front face (sub-project B).
- Side-wall pass-through holes between letters (sub-project C).
- Mounting features (keyholes, screw bosses, French cleats — sub-project D).
- A separate rear-side rabbet for a removable back cover (the back stays fully open).
- A separate `rearWallThickness` parameter (perimeter wall is uniform).

## User-visible behaviour

The mode is **always-on with non-zero default** (`20` mm). Every export ships letters with a rear cavity from day one. Setting `backCavityDepth = 0` reproduces today's flat-back letter exactly:

- Shell mesh Z-range: `[0, totalDepth + backCavityDepth]` (was `[0, totalDepth]`).
- Internal back panel sits at `Z = backCavityDepth` to `Z = backCavityDepth + backThickness` (was `Z = 0` to `Z = backThickness`).
- Front face: at `Z = top` where `top = totalDepth + backCavityDepth`.
- Rabbet step at the front: `Z = top - rabbetDepth` to `Z = top`.
- Rear cavity (NEW): `Z = 0` to `Z = backCavityDepth`. Same XY shape as the front cavity.
- Open at `Z = 0`.

The print orientation aligns with FDM expectation: open back on the print bed (Z=0), perimeter walls grow upward, internal panel bridges, front face caps. Slicers see a sensible default.

## Parameter

Added to `Parameters` in `src/state/parameters.ts`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `backCavityDepth` | number (mm) | `20` | finite; `≥ 0` |

Lives in the "Walls" UI fieldset, just below `Back thickness`. `step={1}`.

`persistence.ts` `migrate()` adds the default for old saved URLs/localStorage. Note: any existing saved state will load with `backCavityDepth = 20`, changing the geometry of those letters compared to before this change. Acceptable for a single-user project where the new default is the desired behaviour.

The reproduce URL serialization in `ExportButtons.tsx` adds the field. The README parameter dump prints `Back cavity depth:`.

## Geometry

### Coordinate system

Today: shell occupies `Z ∈ [0, totalDepth]`. After: shell occupies `Z ∈ [0, top]` where `top = totalDepth + backCavityDepth`.

Z=0 is the lowest face (open rear cavity edge). Z=top is the highest face (front face). When `backCavityDepth = 0`, `top = totalDepth` and the geometry collapses to today's exact Z range.

### `buildLetterShell` (in `src/geometry/shell.ts`)

`ShellInputs` gains `backCavityDepth: number`. The complete updated extrusion logic:

```ts
const top = input.totalDepth + input.backCavityDepth;

// Outer prism: full extent.
const outerPrism = outer.extrude(top);

// Front cavity: above the internal panel, up to the front face.
const frontCavityHeight = top - (input.backCavityDepth + input.backThickness);
const frontCavityExtruded = cavity.extrude(frontCavityHeight);
const frontCavityPrism = frontCavityExtruded.translate([
  0,
  0,
  input.backCavityDepth + input.backThickness,
]);

// Rabbet step at the front face.
const rabbetExtruded = rabbetCut.extrude(input.rabbetDepth);
const rabbetPrism = rabbetExtruded.translate([0, 0, top - input.rabbetDepth]);

// Always-present subtractions.
const shellNoRear = outerPrism.subtract(frontCavityPrism).subtract(rabbetPrism);

// Conditional rear cavity (skip the allocation entirely when backCavityDepth = 0).
let shell;
if (input.backCavityDepth > 0) {
  const rearCavityPrism = cavity.extrude(input.backCavityDepth);
  shell = shellNoRear.subtract(rearCavityPrism);
  shellNoRear.delete();
  rearCavityPrism.delete();
} else {
  shell = shellNoRear;
}
```

When `backCavityDepth = 0`:
- `top = totalDepth`.
- `rearCavityPrism` is null → no rear cavity subtraction.
- `frontCavityHeight = totalDepth − backThickness`.
- `frontCavityPrism` is at `Z = backThickness` to `Z = totalDepth` — identical to today.
- `rabbetPrism` at `Z = totalDepth − rabbetDepth` to `Z = totalDepth` — identical to today.
- Net result: byte-equivalent geometry to today's mesh (modulo floating-point determinism in manifold-3d, which is generally stable for identical inputs).

### `buildLetterPlexi` (in `src/geometry/shell.ts`)

`PlexiInputs` gains `backCavityDepth: number`. The plexi Z translation changes from:

```ts
const positioned = extruded.translate([0, 0, input.totalDepth - input.rabbetDepth]);
```

to:

```ts
const top = input.totalDepth + input.backCavityDepth;
const positioned = extruded.translate([0, 0, top - input.rabbetDepth]);
```

When `backCavityDepth = 0`, this is identical to today.

### `buildLetterLayers` (in `src/exporters/svg.ts`)

Unchanged. The SVG cut sheet is XY-only; the new dimension is Z-only.

### WASM lifecycle

Net new allocations when `backCavityDepth > 0`:
- `rearCavityPrism` (one Manifold from `cavity.extrude`) — deleted inline after the subtract.
- `shellNoRear` (one Manifold from the chained subtracts) — deleted inline after producing `shell`.

When `backCavityDepth = 0`, `shellNoRear` and `shell` are the same instance — only one `.delete()` happens at the end of `buildLetterShell`, matching today's pattern.

CLAUDE.md rule: every CrossSection and Manifold `.delete()`-ed including chained intermediates. Honoured.

## Validation (`validate.ts`)

```ts
if (!Number.isFinite(p.backCavityDepth) || p.backCavityDepth < 0) {
  errors.push({ field: "backCavityDepth", message: "Back cavity depth must be ≥ 0" });
}
```

No upper bound. The user can dial it as deep as they want; printable size is bounded by the printer, not by the app.

## Worker contract

No type-shape changes. `worker.ts` passes `backCavityDepth: req.params.backCavityDepth` into both `buildLetterShell` and `buildLetterPlexi`. `worker-client.ts` `plainParams` adds the field.

## Preview

No code changes in `PreviewCanvas.tsx` or `PreviewLetter.tsx`. The auto-fit camera operates on the world bounding box, which now includes the rear cavity Z extent automatically. `centerMeshXY` is XY-only and unaffected.

The default `backCavityDepth = 20` will make the default `BURGER` preview look chunkier from day one — letters become 200 mm tall × 100+20=120 mm deep. The user explicitly chose this default.

## Export

No filename, folder, or layout changes. The shell mesh has a different Z range; `meshToBinarySTL` serializes whatever's there. Z=0 corresponds to the open back, which slicers interpret as the print bed — correct orientation for FDM printing of marquee letters.

The plexi STL still sits at `Z = top − rabbetDepth` to `Z = top` (the front rabbet recess). Plexi prints with its bottom face on the print bed and top face flush with the rabbet — same as today, just at a different absolute Z.

The reproduce URL gains `backCavityDepth: params.backCavityDepth,`.

## README (`buildReadme`)

The parameter dump adds:

```
  Back cavity depth: 20 mm
```

The label "Back cavity depth:" is 18 characters. Pattern-match the existing column in `manifest.ts`'s `lines` array (the value column is fixed across rows) and pad with the right number of spaces. The implementer will count exactly when wiring the line in.

The file-tree section is unchanged.

## UI

`ControlsPanel.tsx`'s "Walls" fieldset gains one `NumberField`:

```tsx
<NumberField
  label="Back cavity depth"
  unit="mm"
  value={params.backCavityDepth}
  onChange={(v) => params.set({ backCavityDepth: v })}
  error={errorFor(errs, "backCavityDepth")}
  step={1}
/>
```

Placed below `Back thickness`.

## Tests

- `tests/unit/geometry/shell.test.ts`:
  - `backCavityDepth = 0` produces a mesh whose Z bbox is `[0, totalDepth]` (within float tolerance) — today's behaviour preserved.
  - `backCavityDepth = 20` produces a mesh whose Z bbox is `[0, totalDepth + 20]` — asserts the Z-axis grew by exactly the requested amount.
  - Existing tests updated to pass `backCavityDepth: 0` (or whichever explicit value) to keep typecheck green.
- `tests/unit/state/parameters.test.ts` — defaults include `backCavityDepth: 20`.
- `tests/unit/state/persistence.test.ts`:
  - `migrate()` fills `backCavityDepth: 20` when missing.
  - Preserves an existing non-default value.
  - Preserves `0` (falsy but valid).
- `tests/unit/geometry/validate.test.ts`:
  - Accepts `0`.
  - Rejects negative.
  - Rejects NaN.
  - Accepts the default `20`.
- `tests/unit/exporters/manifest.test.ts` — README contains `Back cavity depth:` line.
- `tests/e2e/smoke.spec.ts` — no assertion changes needed.

## Files touched

Modified:
- `src/state/parameters.ts` — new field, default.
- `src/state/persistence.ts` — migrate fills the new field.
- `src/geometry/validate.ts` — bounds.
- `src/geometry/shell.ts` — `ShellInputs.backCavityDepth`, restructured extrusion in `buildLetterShell`; `PlexiInputs.backCavityDepth`, updated Z translation in `buildLetterPlexi`.
- `src/geometry/worker.ts` — passes `backCavityDepth` to both builders.
- `src/geometry/worker-client.ts` — `plainParams` includes the field.
- `src/exporters/manifest.ts` — README parameter line.
- `src/ui/ControlsPanel.tsx` — new `NumberField` in Walls fieldset.
- `src/ui/ExportButtons.tsx` — `buildReproduceUrl` serializable adds the field.
- `tests/unit/geometry/shell.test.ts`
- `tests/unit/state/parameters.test.ts`
- `tests/unit/state/persistence.test.ts`
- `tests/unit/geometry/validate.test.ts`
- `tests/unit/exporters/manifest.test.ts`

## Acceptance

- All existing unit tests still pass (with explicit `backCavityDepth` values added to fixtures where required).
- New unit tests pass.
- E2E continues to pass.
- `npm run build` clean.
- A user with default params downloads a zip whose shell STLs have Z range `[0, 120]` (totalDepth=100 + backCavityDepth=20), and the print bed corresponds to the open back.
- Setting `backCavityDepth = 0` reproduces a flat-back letter geometrically equivalent to the pre-feature output.
