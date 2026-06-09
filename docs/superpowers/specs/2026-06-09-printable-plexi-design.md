# Printable Plexi Inserts — Design Spec

Date: 2026-06-09

## Goal

Ship a 3D-printable plexi insert as part of every export, with a configurable XY tolerance so the printed insert actually drops into the rabbet recess. The same tolerance applies to the existing SVG cut sheet so a laser-cut acrylic insert fits the same way.

## Scope

In scope:
- New parameter `plexiTolerance` (mm, default `0.2`).
- The plexi geometry (preview mesh, STL, and SVG cut shape) is shrunk by `plexiTolerance` relative to the rabbet recess.
- A new top-level zip layout that groups STLs by role (`stl/chars`, `stl/plexi`) and moves SVG cut sheets to a sibling `svg/` folder.
- Filenames carry a `_char` / `_plexi` suffix so a file moved out of its folder is still self-describing.
- Zip filename includes the (sanitised) text and an ISO timestamp.

Out of scope:
- Z-axis tolerance. Only XY shrink.
- A separate "no-tolerance" preview mode.
- Per-component plexi tolerance overrides.
- Material-specific kerf (laser users tune their cutter; we apply one tolerance to the geometry).

## User-visible behaviour

The mode is **always-on** with a non-zero default (`0.2`). Every export ships:

- One STL per connected component shell at `stl/chars/NN_<chars>_char.stl`.
- One STL per connected component plexi insert at `stl/plexi/NN_<chars>_plexi.stl`.
- One SVG plexi cut sheet per connected component at `svg/NN_<chars>_plexi.svg`.
- A `README.txt` at the zip root.

Where a component has no plexi (rabbet/tolerance offset collapsed), its `stl/plexi/` and `svg/` slots are skipped — the shell still ships under `stl/chars/`.

The preview shows the same tolerance-shrunken plexi mesh that lands in the STL. At default tolerance (0.2 mm) the visual difference vs the rabbet recess is imperceptible.

## Parameter

Added to `Parameters` in `src/state/parameters.ts`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `plexiTolerance` | number (mm) | `0.2` | finite; `≥ 0`; `< wallThickness − insetWidth` |

The upper bound (`< lipWidth = wallThickness − insetWidth`) prevents the plexi outline from collapsing to a degenerate shape via excessive tolerance. At equal or greater values the offset eats the entire lip plus more, and `buildLetterPlexi` emits its existing `offset_collapsed` reason — but with the validation rule the user sees a clear "tolerance too large" message instead.

`persistence.ts` `migrate()` adds `plexiTolerance` with the default for old saved URLs/localStorage. The reproduce URL serialisation in `ExportButtons.tsx` adds it. The README parameter dump prints it.

## Geometry

### `buildLetterPlexi` (in `src/geometry/shell.ts`)

`PlexiInputs` gains `plexiTolerance: number`. The offset becomes:

```ts
const lipWidth = input.wallThickness - input.insetWidth;
const rabbetCut = outer.offset(-(lipWidth + input.plexiTolerance), "Round");
```

Everything downstream is unchanged: extrude by `rabbetDepth`, position at `Z = totalDepth - rabbetDepth`. Returns `null` on empty offset.

### `buildLetterLayers` (in `src/exporters/svg.ts`)

`LayerInputs` gains `plexiTolerance`. The `rabbetCut` polygon used for the SVG plexi cut sheet uses the same `-(lipWidth + plexiTolerance)` offset, so the SVG and the 3D plexi are the same XY polygon.

The shell's rabbet recess in `buildLetterShell` is **unchanged** — it still uses `outer.offset(-lipWidth)`. The recess and the insert differ by exactly `plexiTolerance` on each edge, which is the desired clearance.

### Preview

Unchanged code path. `PreviewLetter` continues to render `component.plexi`. Because the worker now produces a tolerance-shrunken mesh, the preview reflects the shape that will actually be printed/cut — visually within 0.1% of the recess at default tolerance.

## Worker contract

No type-shape changes. `ComponentMesh.plexi` and `ComponentLayers.plexi` already exist; they now carry the tolerance-shrunken shape. The worker passes `plexiTolerance` through to `buildLetterPlexi` and `buildLetterLayers`.

The worker request payload (built in `src/geometry/worker-client.ts` `build()`) gains `plexiTolerance` in the `plainParams` extraction.

## Export

### Zip layout

```
lightbox-<sanitisedText>-<isoTimestamp>.zip
├── README.txt
├── stl/
│   ├── chars/
│   │   └── 01_<chars>_char.stl
│   └── plexi/
│       └── 01_<chars>_plexi.stl
└── svg/
    └── 01_<chars>_plexi.svg
```

Each component shares a slot index (1-based, zero-padded). `<chars>` is the joined member chars, sanitised to `[A-Za-z0-9_-]`; the per-file fallback is `componentNN`.

### Zip filename

Format: `lightbox-<text>-<iso>.zip`.

- `<text>`: text input with whitespace replaced by `_`, then non-`[A-Za-z0-9_-]` stripped. If the result is empty, the `-<text>` segment is omitted.
- `<iso>`: ISO 8601 in the **browser's local timezone**, format `YYYY-MM-DDTHH-MM-SS` (no fractional seconds, no `Z` suffix, no offset). Built from `Date` local getters with each component zero-padded; colons replaced by dashes for filesystem safety. Example helper:

```ts
function localIsoFilename(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
```

Local time is preferred over UTC because users see filenames in their own clock; the offset is omitted because these zips are typically opened on the same machine that produced them and the extra characters add no real disambiguation for that workflow.

Examples (assume browser is at local 14:34:56 on 2026-06-09):
- `BURGER` → `lightbox-BURGER-2026-06-09T14-34-56.zip`
- `HELLO WORLD` → `lightbox-HELLO_WORLD-2026-06-09T14-34-56.zip`
- `??` → `lightbox-2026-06-09T14-34-56.zip`

### `bundleAll` API change

```ts
export type ShellEntry = { chars: string; stl: ArrayBuffer };
export type PlexiStlEntry = { chars: string; stl: ArrayBuffer };
export type PlexiSvgEntry = { chars: string; svg: string };

export async function bundleAll(
  shells: ShellEntry[],
  plexiStls: PlexiStlEntry[],
  plexiSvgs: PlexiSvgEntry[],
  readme: string,
): Promise<Blob>;
```

The slot index is the array position (1-based). A component without plexi just doesn't appear in `plexiStls` / `plexiSvgs` — its slot is skipped in those folders.

`safeFilenameFragment(chars, fallback)` is unchanged; the `_char` / `_plexi` suffixes are literal, appended after sanitisation. So an all-symbol component yields `01_componentN_char.stl` etc.

### `ExportButtons.tsx`

Computes three arrays:
- `shells` from `result.components` (existing logic, just renamed from `stls`).
- `plexiStls` from `result.components` filtered to those with a `.plexi` mesh, calling `meshToBinarySTL` on each.
- `plexiSvgs` from `result.layers` (existing logic, renamed from `plexis`).

Calls `bundleAll(shells, plexiStls, plexiSvgs, readme)` and `saveAs(blob, filename)` with the new zip filename built from `params.text` and the current ISO timestamp.

The `buildReproduceUrl` helper adds `plexiTolerance` to its serialisable object.

### README (`buildReadme`)

The "Files in this archive" section is rewritten to match the new layout. The parameter dump adds `Plexi tolerance: <v> mm`. The Pieces section's preamble notes that each piece can have a shell STL, plexi STL, and plexi SVG.

## Validation (`validate.ts`)

```ts
// plexiTolerance: ≥ 0, finite, < lipWidth.
if (!Number.isFinite(p.plexiTolerance) || p.plexiTolerance < 0) {
  errors.push({ field: "plexiTolerance", message: "Plexi tolerance must be ≥ 0" });
} else if (
  Number.isFinite(p.wallThickness) &&
  Number.isFinite(p.insetWidth) &&
  p.plexiTolerance >= p.wallThickness - p.insetWidth
) {
  errors.push({
    field: "plexiTolerance",
    message: "Plexi tolerance must be less than (wall thickness − inset width); larger collapses the insert",
  });
}
```

The existing `offset_collapsed` reason still applies for runtime cases the validator can't predict (e.g. very thin font features that collapse the plexi even at small tolerances).

## UI

`ControlsPanel.tsx`'s "Plexi inset" fieldset gains one `NumberField`:

```tsx
<NumberField
  label="Plexi tolerance"
  unit="mm"
  value={params.plexiTolerance}
  onChange={(v) => params.set({ plexiTolerance: v })}
  error={errorFor(errs, "plexiTolerance")}
  step={0.05}
/>
```

Placed below `Inset width`, above `Show plexi in preview`.

## Tests

Mirror the changes under `tests/unit/`.

- `tests/unit/geometry/shell.test.ts`: extend `buildLetterPlexi` tests with a `plexiTolerance > 0` case asserting the produced mesh's bbox is strictly smaller in XY than the no-tolerance version (by approximately `2 * plexiTolerance` in width/height).
- `tests/unit/exporters/svg.test.ts` (or the layers test): same — `buildLetterLayers` with tolerance produces smaller plexi polygons.
- `tests/unit/exporters/zip.test.ts`: rewrite for the new three-array `bundleAll` signature. Cases:
  - Standard pack: shell + plexi STL + plexi SVG land in the right folders with `_char` / `_plexi` suffixes.
  - Component with no plexi (skip in plexi folders, shell still ships).
  - Joined member chars for connected component.
  - All-symbol component falls back to `componentN`.
  - SVG no longer at `plexi/`; STL no longer at `stl/<chars>.stl` (catches accidental regression to the old layout).
- `tests/unit/state/parameters.test.ts`: defaults include `plexiTolerance: 0.2`.
- `tests/unit/state/persistence.test.ts`: `migrate()` fills the new field; preserves an existing user-set value.
- `tests/unit/geometry/validate.test.ts`: rejects `plexiTolerance < 0`; rejects `plexiTolerance >= wallThickness − insetWidth`; accepts `0`; accepts a value just under the upper bound.
- `tests/unit/exporters/manifest.test.ts`: README contains `Plexi tolerance:` line and the new file-tree description.
- `tests/e2e/smoke.spec.ts`: assert the new zip layout (`stl/chars/01_Hi_char.stl`, `stl/plexi/01_Hi_plexi.stl`, `svg/01_Hi_plexi.svg`); assert the download filename matches the `lightbox-Hi-<iso>.zip` pattern; assert the absence of the old paths.

The connected-mode e2e case is updated to use the new layout names too.

## Files touched

Modified:
- `src/state/parameters.ts` — new field, default.
- `src/state/persistence.ts` — migrate fills the new field.
- `src/geometry/validate.ts` — new bounds.
- `src/geometry/shell.ts` — `PlexiInputs.plexiTolerance`; offset uses `lipWidth + plexiTolerance`.
- `src/exporters/svg.ts` — `LayerInputs.plexiTolerance`; same offset change.
- `src/geometry/worker.ts` — passes `plexiTolerance` to `buildLetterPlexi` and `buildLetterLayers`.
- `src/geometry/worker-client.ts` — `plainParams` adds `plexiTolerance`.
- `src/exporters/zip.ts` — new `bundleAll` signature, new folder layout, `_char` / `_plexi` suffixes.
- `src/exporters/manifest.ts` — print new param, update file-tree doc, Pieces preamble.
- `src/ui/ControlsPanel.tsx` — new `NumberField`.
- `src/ui/ExportButtons.tsx` — three-array bundle call, new zip filename, reproduce URL adds the param.
- All affected unit tests (see above).
- `tests/e2e/smoke.spec.ts` — new layout, filename pattern.

## Acceptance

- All existing unit tests still pass.
- New unit tests pass.
- E2E asserts the new layout, suffixes, and filename pattern.
- `npm run build` clean (`tsc -b` + `vite build`).
- A user with default params downloads `lightbox-BURGER-<iso>.zip`, opens it, finds shells under `stl/chars/`, plexi STLs under `stl/plexi/`, plexi SVGs under `svg/`, and a README describing the layout.
- A user printing the plexi STL at default tolerance can drop it into the printed shell's rabbet recess with a snug FDM fit (~0.2 mm clearance).

## WASM lifecycle reminder

`buildLetterPlexi` and `buildLetterLayers` already manage their CrossSection allocations correctly. The change is purely in the offset magnitude — no new allocations, no new deletes. CLAUDE.md's WASM rule continues to apply for any future edits to these functions.
