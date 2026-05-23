# Lightbox Letter Generator — Design

**Date:** 2026-05-22
**Status:** Draft

A browser-based generator that turns typed text + a custom font into 3D-printable letter shells and 2D laser-cut layer files for backlit lightbox signs. Each letter is produced as an independent piece with a hollow interior, a closed back, and a rabbet step on the front face that holds a letter-shaped piece of plexiglass flush with the top.

Reference: <https://github.com/framegrabber/PixelTagMaker> (similar tech stack, similar in-browser-only model).

## Goals

- Type a word, pick a font, get printable / cuttable lightbox letters in seconds
- Run entirely client-side: no server, no account, deployable to GitHub Pages
- Manifold-guaranteed STL output
- Match the visual reference: hollow letter shells with a stepped rabbet that follows both the outer contour and inner counters

## Non-goals (v1)

- Mounting hardware, hanging holes, LED channels, wire pass-throughs
- Multi-line auto-layout (newlines are visual only; each line is a separate run)
- Bridging disjoint glyph parts (e.g. dot of `i`) — deferred to v2
- Visual regression tests on the 3D preview
- Custom kerning / per-letter overrides

## Tech stack

- **Vite + React + TypeScript**
- **opentype.js** — TTF/OTF parsing, glyph contours, advance widths, kerning
- **manifold-3d (WASM)** — 2D `CrossSection` for offsets, 3D `Manifold` for extrude + booleans, mesh export
- **three.js + @react-three/fiber** — interactive 3D preview
- **zustand** — parameter store
- **JSZip + FileSaver** — bundle exports
- **Vitest** — unit tests; **Playwright** — one end-to-end smoke test
- **GitHub Pages** via Actions

Bundled fonts: 2–3 royalty-free defaults (e.g. Inter, Bebas Neue, a rounded display face).

## Project layout

```
src/
  geometry/    # pure functions: glyph → contours → shell mesh
  fonts/       # opentype loading, glyph cache, bundled font assets
  exporters/   # stl.ts, svg.ts, zip.ts
  ui/          # React components
  state/       # parameters store
  App.tsx
```

Each unit has one purpose: `geometry` knows nothing about React, `ui` knows nothing about manifold, `exporters` consume geometry results and produce blobs.

## Parameters

```ts
type Parameters = {
  text: string;                  // e.g. "MAKING"
  fontSource:
    | { kind: "bundled"; id: string }
    | { kind: "uploaded"; name: string; data: ArrayBuffer };
  letterHeight: number;          // cap-height target in mm; lowercase scales proportionally via the font's x-height ratio
  wallThickness: number;         // mm
  totalDepth: number;            // Z-extent of the box, mm
  backThickness: number;         // floor thickness, mm
  rabbetDepth: number;           // == plexi sheet thickness, mm
  rabbetLipWidth: number;        // visible lip from outer wall, mm; must be < wallThickness so the lip carves into the wall material rather than eating it
  bezierTolerance: number;       // glyph flattening, mm (advanced)
};
```

All units in mm.

### Validation

A pure `validate(params, font)` function returns `{ ok: true, derived }` or `{ ok: false, errors }`. Rules:

- `rabbetDepth < totalDepth − backThickness` (rabbet must fit above floor + leave wall above floor)
- `rabbetLipWidth < wallThickness` (the lip is carved into the wall; if it equaled or exceeded the wall, there would be no material to support the plexi shelf)
- `wallThickness × 2 < min_glyph_stem_width` for every letter present in `text` (otherwise offset collapses the cavity)
- `letterHeight > 0`, `bezierTolerance > 0`, all numeric params finite

Errors include the offending letter name where relevant ("rabbet too wide for stroke of letter `i`"). UI surfaces them inline next to the affected control.

### Persistence

- Parameters serialize to URL query string (shareable config link)
- Mirror to localStorage so refresh preserves state
- Uploaded fonts stored in IndexedDB keyed by SHA-256 hash, referenced in the URL by hash. If a shared URL references a hash the visitor doesn't have, the UI prompts them to upload that font.

## Geometry pipeline

Each letter is built independently from this pipeline. All steps are pure functions; no React, no DOM.

### Step 1 — Glyph to 2D contour set

opentype.js gives a `Path` of move/line/quad/cubic commands. Flatten beziers to polylines at `bezierTolerance` (default 0.1 mm). Result: ordered list of closed polygons per glyph, with winding indicating outer vs hole (e.g. `A` → outer shape + inner triangle hole). Scale so the font's cap-height maps to `letterHeight`.

### Step 2 — Build three 2D regions with manifold's `CrossSection`

- `outer` = glyph polygons as-is
- `cavity` = `outer.offset(-wallThickness)` (the hollow inside the walls)
- `rabbetCut` = `outer.offset(-rabbetLipWidth)` (the plexi-shaped cutout; because `rabbetLipWidth < wallThickness`, this polygon is larger than `cavity` and its hole on the front face contains the cavity hole, producing a visible rabbet shelf)

If any offset returns empty for a letter, fail validation for that letter with a clear error.

### Step 3 — Extrude and boolean to a shell

- `outerPrism` = extrude `outer` by `totalDepth`
- `cavityPrism` = extrude `cavity` by `totalDepth − backThickness`, translated up by `backThickness`
- `rabbetPrism` = extrude `rabbetCut` by `rabbetDepth`, translated to sit at the top face
- `shell` = `outerPrism − cavityPrism − rabbetPrism`

Result: a closed letter with hollow interior, closed back floor, and a rabbet step on the front face that follows the full letter contour (outer + counters).

### Step 4 — Per-letter positioning

For preview, lay letters out using opentype advance widths + kerning so the preview reads as the word. For export, each letter is its own mesh, centered at its own origin, oriented Z-up.

### Disjoint glyphs (v1)

Letters with disjoint contours (`i`, `j`, `?`, `!`, `:`, `;`, `…`) ship as separate solids in the same STL file at their relative font-metric positions. Manifold handles multi-component meshes natively. A bridge feature to mechanically connect these is deferred to v2.

## Exports

### STL (.zip)

- One binary STL per letter, named `01_M.stl`, `02_A.stl`, …
- Numeric prefix preserves word order; letter suffix for legibility
- Duplicate letters get separate files (`03_K.stl`, `04_K.stl` for "KK")
- Spaces and unsupported glyphs are skipped with a warning in the UI
- `manifest.json` inside the zip records the full parameter set + font SHA-256, making a download reproducible
- Each STL is centered on its outer-contour bounding box in X/Y, with the back face at `Z = 0` and the letter extending up to `Z = totalDepth` (ready to drop on a print bed). Units mm. No preview-layout offsets are baked in.

### SVG (.zip)

Four layers per letter for laser-cut assembly:

- `01_M_back.svg` — solid letter outline (the floor)
- `01_M_wall.svg` — donut: outer letter minus inner cavity offset (one wall layer; user stacks N copies to reach `totalDepth − rabbetDepth − backThickness`)
- `01_M_rabbet.svg` — donut: outer letter minus rabbet cutout (the lip layer)
- `01_M_plexi.svg` — solid: rabbet cutout shape (cut from acrylic, drops into the rabbet)
- All paths in mm, single-color stroke at 0.001 mm, no fill, viewBox tight to glyph bounds + small margin

A `README.txt` in each zip explains naming and stack order.

## UI

Single page, two-column layout. No routing.

### Left — controls (scrollable)

- Text input: textarea, newline-delimited (each line is its own run; no cross-line layout)
- Font picker: dropdown of bundled fonts + "Upload TTF/OTF…" button. Selected font shown as a small preview strip rendering the current text.
- Parameter inputs grouped: **Size** (letterHeight), **Walls** (wallThickness, totalDepth, backThickness), **Plexi inset** (rabbetDepth, rabbetLipWidth). Each shows units and live-validates.
- Inline validation errors under offending controls, with letter name where relevant.
- "Advanced" collapsible: bezierTolerance.
- Export buttons at bottom: **Download STL (.zip)** and **Download SVG (.zip)**.

### Right — 3D preview

- react-three-fiber canvas, orbit controls, neutral background, soft shadows
- Letters laid out using opentype advance widths + kerning
- View toggle: solid / wireframe / x-ray (to see the rabbet step inside)
- Overlay: letter count + total estimated print volume (mm³)

### Behaviour

- Parameter change → debounced (~150 ms) regen → preview updates
- Heavy work (CSG) runs in a Web Worker; UI stays responsive
- Worker reports per-letter progress; preview shows a thin progress bar
- Empty state (no text): faded "Type a word to begin" placeholder
- Font parse error: upload control shows the error and reverts to the previous font

## Testing

### Unit (Vitest)

- Glyph flattening at varying tolerances
- Offset edge cases: thin stems, empty results, multi-contour glyphs
- Parameter validation rules (each rule has at least one failing fixture)
- STL byte structure (header, triangle count, normal sanity)
- SVG path output for fixed glyph fixtures

### Geometry fixtures

Snapshot tests for 4–5 representative glyphs at fixed parameters, hashing the manifold mesh:

- `M` — simple, no counters
- `A` — open-bottom counter
- `O` — closed counter
- `i` — disjoint dot + stem
- `&` — complex contour

Mesh hash changes are flagged as snapshot diffs; intentional regressions get re-snapshotted.

### Smoke (Playwright)

One end-to-end test: load page → type "Hi" → switch font → tweak rabbet depth → download STL zip → assert zip contains `01_H.stl`, `02_i.stl`, `manifest.json`.

No visual regression on the Three preview — too brittle for v1.

## Open questions and future work

- **Bridging disjoint glyphs** (v2): configurable bridge depth (0 = off, `backThickness` = back-tab, `totalDepth` = full wall) routed via shortest line between connected components.
- **Multi-line auto-layout**: line height, alignment, mixed kerning across lines.
- **Mounting features**: keyholes on the back, LED-strip channels, cable pass-throughs.
- **Font licensing UX**: warn on uploaded fonts whose embedding bits forbid redistribution.

## Acceptance criteria for v1

- Typing a single-line word with a bundled font produces a valid 3D preview within 1 second on a typical laptop.
- Uploading a TTF/OTF and re-rendering completes within 2 seconds for words ≤10 letters.
- STL zip download contains one valid binary STL per visible letter, plus `manifest.json`.
- SVG zip download contains four layer files per letter, plus `README.txt`.
- All validation rules trigger inline errors with letter-specific messages where relevant.
- No console errors on the deployed GitHub Pages build for the bundled-fonts happy path.
