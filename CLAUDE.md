# CLAUDE.md

Browser-only generator that turns text + a font into 3D-printable lightbox letter shells with a frosted-acrylic plexi inset. All geometry runs client-side.

Live: <https://framegrabber.github.io/lightbox-letter-generator/>

## Stack

- **Vite + React 19 + TypeScript** — strict, `verbatimModuleSyntax` on (use `import type` for types)
- **manifold-3d** (WASM) — 2D `CrossSection` for offsets, 3D `Manifold` for extrude + booleans
- **opentype.js** — font parsing
- **three.js + @react-three/fiber + drei** — 3D preview, Z-up scene
- **zustand** — parameter store + tiny session UI store
- Geometry runs in a **Web Worker**; main thread stays responsive

## Commands

```bash
npm run dev      # http://localhost:5173
npm run build    # static dist/
npm test         # Vitest unit tests
npm run e2e      # Playwright smoke (run `npx playwright install chromium` once)
npm run lint     # ESLint flat config
```

## Layout

- `src/geometry/` — pure-function pipeline (no React, no DOM): `flatten` → `scale` → `layout` → `merge` → `shell` (CSG). `worker.ts` orchestrates per-component; `manifold-init.ts` is the WASM singleton.
- `src/exporters/` — `stl.ts` (binary STL writer), `svg.ts` (`polygonsToSVG` + `buildLetterLayers`), `zip.ts` (single `bundleAll`), `manifest.ts` (now `buildReadme`, name kept for history).
- `src/state/` — `parameters.ts`, `ui.ts`, `persistence.ts` (URL + localStorage with migration).
- `src/ui/` — React components, three.js preview, controls panel.
- `src/fonts/` — bundled font registry, opentype loader, IndexedDB cache for uploaded fonts.
- `tests/unit/`, `tests/e2e/`, `tests/fixtures/fonts/Inter-Regular.ttf`.

## Coordinate system

- Letters lay flat in the XY plane, extruded along **+Z**. Z=0 is at the lowest face — the open back when `backCavityDepth > 0`, the back panel when `backCavityDepth = 0`. Front face at `Z = totalDepth + backCavityDepth`.
- After `flatten.ts`'s Y-flip, **letters span Y ∈ [0, +letterHeight]** — baseline at Y=0, cap-line at Y=+letterHeight. Positive Y is up; the flip negates opentype's screen-down Y to give us a math-style coordinate system.
- Outer contours emerge CCW, holes CW (via point-in-polygon parity correction in `flatten.ts`).
- The geometry pipeline (worker, STL exports, all the math) is **Z-up**. The preview scene wraps everything in a `<group rotation={[-Math.PI/2, 0, 0]}>` so the display is Y-up — drei's gizmo widgets (`<GizmoViewcube>`, `<GizmoViewport>`) hard-code Y-up, and rendering through this rotation lets them work natively without convention conflicts. The rotation is at scene-display level only; the geometry data and exported STLs remain Z-up. `camera.up = (0, 1, 0)`. Auto-fit constants at the top of `PreviewCanvas.tsx` are pre-mapped through this rotation.

## Plexi/rabbet semantics — `insetWidth` (not lip width)

- `insetWidth` = the SHELF width (where the plexi rests). Not the visible lip from the outer edge.
- Visible lip width = `wallThickness − insetWidth` (computed; not a stored param).
- Validation: `0 < insetWidth < wallThickness`. Equal collapses the lip; greater inverts the geometry (cavity hole then contains the rabbet hole and the rabbet contributes nothing).
- Geometry: `rabbetCut = outer.offset(-(wallThickness − insetWidth), "Round")`.
- Legacy URL/localStorage saves used `rabbetLipWidth`; `persistence.ts` `migrate()` translates them.
- `plexiTolerance` (default 0.2 mm) shrinks the plexi geometry inward by that amount so a 3D-printed or laser-cut insert drops into the rabbet recess. The same tolerance applies to the STL mesh, the SVG cut sheet, and the preview render — one shape, one source of truth. Validation enforces `0 ≤ plexiTolerance < (wallThickness − insetWidth)`; values at or above the upper bound collapse the insert.

## Worker contract — `src/geometry/worker.ts` ↔ `src/geometry/worker-client.ts`

- Types are canonical in `worker-client.ts`; `worker.ts` imports them via `import type`.
- **`ComponentMesh.members[].index` is the ORIGINAL text index, including spaces.** Each member preserves the position of its character in the source text — used by the worker to key glyph contours. Don't switch to a filtered (no-spaces) index — that bug previously broke `"ipsum ipsum"` and `" opsum"`.
- A component may contain one or more letters. Default params produce one letter per component (today's behavior). When `letterOverlap > 0` or a bridge is configured, adjacent letters merge into a single component with one merged shell, plexi, and STL.
- Each component ships with a shell mesh AND a plexi mesh, both shifted by the same `(cx, cy)` so they align in the scene.
- All typed-array buffers are listed as transferables on `postMessage`.
- The promise rejects on `worker.onerror`; `usePreviewBuild` wraps the await in try/catch/finally so `busy` always resets. Without that, a worker exception leaves the UI permanently in "Generating…".

## Mesh centering caveat

`centerMeshXY` shifts every shell mesh to its own bbox center so the EXPORTED STL is centered at origin. `PreviewLetter` adds the bbox center BACK to the world position (`xOffset + cx`, `cy`) to restore opentype's natural advance-width spacing. Without this letters overlap (narrow letters drift left, wide letters overhang). Don't remove this compensation.

## WASM lifecycle (manifold-3d)

- Every `CrossSection` and `Manifold` MUST be `.delete()`-ed, **including INTERMEDIATE results of chained operations**: `outer.offset(-x).extrude(d).translate(...)` leaks the offset and the extrude. Always assign each intermediate to a name and delete it.
- `getMesh()` returns Float32Array/Uint32Array views into the WASM heap. Copy with `.slice()` BEFORE deleting the source manifold — otherwise the views point at recycled memory after the next allocation.
- `manifold-init.ts` is a singleton; the worker calls it once per session.

## State

- `state/parameters.ts` — the design parameters (text, font, dimensions, etc.). Persisted to URL `?p=<JSON>` + localStorage on every change.
- `state/ui.ts` — session-only UI flags (`showCameraHUD`, `showPlexi`). NOT persisted.
- `state/persistence.ts` — `migrate()` translates legacy `rabbetLipWidth` saves; `URLSearchParams.set` handles encoding (don't double-encode).

## Connected mode

`letterOverlap`, `bridgeWidth`, `bridgeHeight`, `bridgeY` (in `state/parameters.ts`) drive the merge stage. With all four at zero/default, every letter forms its own component and behavior is identical to today's per-letter STLs.

`src/geometry/merge.ts` is the heart of the feature: it translates each glyph's contours by its `xOffset`, optionally adds bridge rectangles between consecutive non-space pairs, runs union-find by `CrossSection.intersect` non-empty, and unions each connected group into one merged contour set. A single-member group with no bridges takes a fast path and skips the CrossSection round-trip.

A bridge that doesn't actually touch both endpoints (e.g. `bridgeY` outside the letters' Y range) emits a `bridge_disconnected` warning and is dropped — the component split is unchanged.

`bridgeY` defaults to `+letterHeight / 2` because letters span `Y ∈ [0, +letterHeight]` after `flatten.ts`'s Y-flip — baseline at Y=0, cap-line at Y=+letterHeight, mid-letter at Y=+letterHeight/2. The default does not auto-update when `letterHeight` changes; an intentional user value is preserved.

## Back cavity

`backCavityDepth` (default 20 mm) extends the perimeter wall behind the existing back panel by that amount. The back panel becomes an internal partition: front cavity above (LED + plexi diffusion), rear cavity below (open back, electronics access). Setting `backCavityDepth = 0` collapses the geometry to the original flat-back letter — verifiable by unit test.

The shell mesh's coordinate system shifts so Z=0 is at the open back (lowest face) and Z=`totalDepth + backCavityDepth` is at the front. Slicers print marquee letters open-side-down by default. `buildLetterPlexi`'s Z translation tracks the new top so the plexi mesh stays aligned with the front rabbet.

## Cable holes

`cableHoleDiameter`, `cableHoleY`, `cableHoleZ`, `cableHoleAtEnds` (in `state/parameters.ts`) drive the cable-hole drilling step. Default `cableHoleDiameter = 0` disables the feature; geometry is unchanged.

`src/geometry/cable-holes.ts` is a pure helper: given the layout, the per-glyph contour map, and the parameters, it returns a list of horizontal cylinder specs in word space. Boundary cylinders sit between every adjacent non-space letter pair (same `b.index - a.index === 1` rule as bridges); power-entry cylinders sit at the leftmost letter's left edge and the rightmost letter's right edge when `cableHoleAtEnds = true`.

Boundary cylinder length = `max(|gap| + 4·wallThickness, 4·wallThickness)` — enough margin to fully pierce both adjacent walls without normally reaching the opposite walls of those letters. Power-entry length = `4·wallThickness`. Very thin letters (narrow stems) may get pierced all the way through; that's acceptable for a cable channel.

`worker.ts` calls `computeCableHoles` once per build and per-component filters by X-bbox overlap before passing the filtered list to `buildLetterShell`. For separate components, a single boundary cylinder gets passed to BOTH adjacent components (each carves its own wall). For merged components (overlap or bridges), the same cylinder gets passed to the single merged component (carves a tunnel through the joining material).

`shell.ts`'s drill loop builds a Z-cylinder, rotates 90° around Y to align with X, translates to (x, y, z), and subtracts. Every intermediate Manifold is `.delete()`-ed inline.

If a bridge sits at the same Y/Z as a cable hole, the cylinder pierces the bridge bar (cable runs through it). No special-casing.

## Mounting

`mountShankDiameter`, `mountSlotY`, `mountSlotXInset` (in `state/parameters.ts`) drive the keyhole-mount step. Default `mountShankDiameter = 0` disables the feature; geometry is unchanged. `headDiameter = 2 × shank` and `slotLength = 2 × shank` are derived in `mounts.ts` and never stored.

`src/geometry/mounts.ts` is a pure helper: given the component's merged contours and mount params, it returns a `MountPlan` of two slots (one per side) and zero or two tabs. Slot X positions come from `xExtentAtY(contours, mountSlotY)` (imported from `cable-holes.ts`) — the slice's `minX + xInset` and `maxX − xInset`. Bbox-based positioning would put a slot in air for tapering letters (V, A) at high Y values where the actual material is narrow; the slice picks the real wall positions.

If `mountSlotY` is outside the contour's Y range, `xExtentAtY` returns null and `computeMounts` returns an empty plan — the user sees no keyholes in the preview and adjusts.

`worker.ts` calls `computeMounts` per component using the merged contours. For separate components, each gets its own pair of slots (and tabs). For merged components (overlap or bridges), the merged contours place slots at the actual wall positions on the outer letters of the joined piece.

`shell.ts`'s mount block runs **after** cable-hole drilling: tabs are unioned in via `Manifold.cube` (each tab is `intersect`-clipped to `outerPrism` first so it follows the actual letter outline across its full Y range and never sticks out where the outline narrows below `slotY`), then for each slot a keyhole through-hole is subtracted at Z ∈ `[0, backThickness]`. For flat-back (`backCavityDepth = 0`) the keyhole goes through the back panel directly. For open-back the tab fills the gap at the open rear so the keyhole has material to cut through; the partition further forward stays solid. No back-side pocket — it ate too much material on a typical 2 mm panel without enough mechanical benefit.

The keyhole shape itself is built from three primitives: a head circle (`Manifold.cylinder` at radius `headDiameter/2`) at the bottom, a narrow slot box (`Manifold.cube`, width = `shankDiameter`, length = `slotLength`) rising to `slot.y`, and a small rounded top circle (`Manifold.cylinder` at radius `shankDiameter/2`) so the slot top is also rounded — matches a stadium-with-bulb shape rather than a sharp-cornered slot.

Slot orientation: round head opening at the BOTTOM, narrow shank slot extending UPWARD. `mountSlotY` is the Y of the screw's resting position (= top of the slot). The user marks the wall and drills the screws at letter-coord Y = `mountSlotY`.

Tabs (open-back only) are sized to bracket the keyhole shape with a 2 mm margin in Y, and stretch in X from the slice edge (just outside `slice.minX` for the left tab, just past `slice.maxX` for the right) to past the slot. The slice-edge anchor guarantees the tab fuses with the perimeter wall material at `mountSlotY`, so no floating geometry results regardless of letter shape.

## Bulb holes

`bulbHoleDiameter`, `bulbHoleSpacing`, `bulbHoleMaxCount` (in `state/parameters.ts`) drive the back-panel bulb-hole drilling step. Default `bulbHoleDiameter = 0` disables the feature; geometry is unchanged. `bulbHoleInset` is retained in the type for backward compatibility with persisted saves but is **unused** by the current algorithm — early versions used an offset-based approximation that needed tuning, and the field still appears in the URL/localStorage.

The hole positions follow the **true medial axis** of each letter cavity, computed by raster thinning. `src/geometry/skeleton.ts` rasterises the cavity polygons to a 1 mm-pixel binary grid, runs Zhang-Suen iterative thinning until the foreground is one pixel wide, then traces the surviving pixels into open polylines back in mm coordinates. `src/geometry/bulb-holes.ts` walks each polyline at `bulbHoleSpacing` arc-length intervals (capped per polyline by `bulbHoleMaxCount * length / totalLength`), placing a hole at each sample. Polylines shorter than `bulbHoleSpacing` collapse to a single hole at the segment midpoint.

Why thinning rather than `cavity.offset(-d)`: an offset of `-d` produces a 2-D ribbon, and walking its perimeter visits both sides — placing two parallel rows of holes for any non-zero ribbon width. For non-uniform stroke widths (most letters), no single inset value gives a uniformly-thin ribbon, so the offset approach produces scattered or paired holes rather than a single line. Skeleton thinning sidesteps this entirely: the medial axis is a 1-D curve regardless of stroke shape.

`shell.ts` drills each hole as a Z-axis cylinder of length `backThickness + 2·ε`, centred at `Z = backCavityDepth + backThickness/2` so it always pierces the back panel — same code path for flat-back and open-back. The drilling loop runs AFTER cable-holes and BEFORE mounts, so the order is: cavity → cable holes → bulb holes → mount tabs → mount keyholes. A bulb hole that lands inside the keyhole footprint just means the keyhole's subtraction has nothing extra to remove there.

If the cavity itself collapses (e.g. wall thickness >= half the letter), the helper emits a `bulbhole_inset_collapsed` warning per component (name preserved for compatibility with the shipped `MergeWarning` union). Surfaced via the same channel as `bridge_disconnected`.

Pixel size of 1 mm is hardcoded in `bulb-holes.ts` as `SKELETON_PX_SIZE`; sub-mm placement error after the half-pixel sample offset is well below typical hole spacings. Skeleton tracing prefers 4-connected neighbours over diagonals so adjacent skeleton steps stay close in arc length — important for `bulbHoleSpacing` to mean what it says.

## `NumberField` behaviour

Local string state lets the user clear the input or type intermediate values like `"5."` without the controlled value snapping back. Commits to `onChange` whenever the text parses to a finite number; snaps back to the prop value only on blur if unparseable. Don't simplify back to a plain controlled input — that brought back "I can't clear the field to retype".

## Bundled fonts

- 8 fonts in `public/fonts/`, registered in `src/fonts/bundled.ts`. **Anton is the default.**
- **Montserrat must be the STATIC Regular** from `JulietaUla/Montserrat`. The Google Fonts variable build (`Montserrat[wght].ttf`) parses to near-skeleton outlines via opentype.js (~5× too thin) and breaks offset operations. See `swap Montserrat variable for static Regular` in git history.
- Fonts are fetched lazily — only the selected font hits the network on initial load.

## Preview shading

- `PreviewLetter.tsx` calls `toNonIndexed()` **before** `computeVertexNormals()`. Each triangle then has its own vertices, so normals match each face — crisp 90° creases. Don't drop this; default smooth shading rounds every corner.
- Plexi uses `MeshPhysicalMaterial` with `transmission: 0.6, thickness: 2, roughness: 0.85, ior: 1.49, opacity: 0.55, depthWrite: false`. The `depthWrite: false` is load-bearing — without it the shell behind the plexi disappears.

## Viewer

`PreviewCanvas.tsx` composes:

- A drei `<Grid>` (rotated `[Math.PI/2, 0, 0]` so it lands on world XY) with `cellSize` / `sectionSize` derived from the geometry bbox via `src/ui/grid-spacing.ts`'s `pickGridSpacing` (NICE_NUMBERS sequence 1/2/5/10/20/50/100/200/500/1000/2000/5000, target ~5 major lines across `max(bboxX, bboxY)`).
- Numbered tick labels along the X axis (Y=0) and Y axis (X=0) using drei `<Text>` inside `<Billboard lockX lockY>` — labels rotate around world Z to face the camera azimuth so they read at any orbit angle except strict top-down. Capped at `MAX_TICKS_PER_DIRECTION = 30` per axis.
- An `mm` legend label at the origin so the unit is unambiguous; the `"0"` tick is suppressed.
- A drei `<GizmoHelper><GizmoViewcube/></GizmoHelper>` in the top-left for click-to-orient (faces / edges / corners). Distance to target is preserved; only orientation changes. Works natively because the scene contents are wrapped in a Y-up display rotation (see "Coordinate system").
- A bottom-left `.preview-toolbar` column with the existing Fit button + a new Grid-toggle button.

Both grid and viewcube are gated on `useUI.showGrid` / `useUI.showViewcube` (session-only flags, defaults `true`). Only `showGrid` has a UI toggle button in v1; `showViewcube` exists in the store for a future toggle.

Display-rotation history: drei's gizmos (Viewcube, Viewport) hard-code Y-up — when run against our originally Z-up scene the cube's face labels and rotation paths were wrong (clicking "FRONT" rotated the word 90°; orientation changes took the long way round). The fix was to wrap scene contents in a `<group rotation={[-Math.PI/2, 0, 0]}>` so display is Y-up, and switch the camera to `camera.up = (0, 1, 0)`. The geometry pipeline (worker, STLs, params) stays Z-up — only the display layer rotates. If a future change needs to reach into the scene at the world-coordinate level (light positions, helpers, debug objects), do so INSIDE the group; anything outside lives in display-Y-up world.

## Export format

```
lightbox-<text>-<localIso>.zip
├── README.txt              # human-readable params + reproduce URL
├── stl/
│   ├── chars/01_<chars>_char.stl   # printable letter shells
│   └── plexi/01_<chars>_plexi.stl  # printable plexi inserts
└── svg/01_<chars>_plexi.svg         # laser-cut plexi sheets
```

- One entry point: `bundleAll(shells, plexiStls, plexiSvgs, readme)`.
- Each component shares a slot index (1-based, zero-padded). `<chars>` is the joined member chars, sanitized to `[A-Za-z0-9_-]`; the per-file fallback is `componentNN`. Filenames carry a literal `_char` or `_plexi` suffix so a file moved out of its folder is still self-describing.
- Components without a plexi (e.g. offset_collapsed) skip the `stl/plexi/` and `svg/` slots; the shell still ships under `stl/chars/`.
- Zip filename: `lightbox-<sanitizedText>-<localIso>.zip` where `<localIso>` is `YYYY-MM-DDTHH-MM-SS` in the browser's local timezone. Built by `src/exporters/filename.ts`.
- `buildReadme(params, reproduceUrl, pieces?)` produces the README text. The reproduce URL is built from `window.location.origin + window.location.pathname + "?p=" + JSON.stringify(serializableParams)` in `ExportButtons`.
- The earlier four-layer SVG export (back/wall/rabbet/plexi) and `manifest.json` are GONE. Don't reintroduce them without an explicit ask.

## Tests

- 167 Vitest unit tests, mirrors the `src/` layout under `tests/unit/`.
- `tests/e2e/smoke.spec.ts` exercises full type → download. It sets explicit params (text, height, wall thickness, inset) so it doesn't depend on the current defaults — when defaults change, the test still passes. It asserts the zip layout (`stl/chars/`, `stl/plexi/`, `svg/`, `README.txt`, no `manifest.json`).
- Test fixture font: `tests/fixtures/fonts/Inter-Regular.ttf`.

## Deploy

- Push to `main` → `.github/workflows/deploy.yml` → GitHub Pages.
- Vite has `base: "./"` for Pages subpath compatibility.
- Workflow uses Node 22 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env to opt the runner into Node 24 for any actions still shipping Node 20 internals.

## Known landmines

- drei's `<SoftShadows>` (PCSS) injects shaders that reference `unpackRGBAToDepth`, removed in current three.js. Compile fails. Use VSM with `shadow-radius` if soft shadows are reintroduced.
- opentype.js's variable-font handling is unreliable for some files. Prefer static Regular weights when bundling.
- ESLint flat config (`eslint.config.js`) — not legacy `.eslintrc`. The `lint` script just calls `eslint src` and lets the flat config's `files:` glob do the scoping.
- `verbatimModuleSyntax` is on, so type-only imports must use `import type { ... }`. Mixed default/type imports are common (`import opentype from "opentype.js"` for the namespace; type access like `opentype.Font` is type-only and fine).

## Spec / plan

- Spec is current with code: `docs/superpowers/specs/2026-05-22-lightbox-letter-generator-design.md`.
- Connected-letters feature spec: `docs/superpowers/specs/2026-06-05-connected-letters-design.md` (current with code).
- Printable-plexi feature spec: `docs/superpowers/specs/2026-06-09-printable-plexi-design.md` (current with code).
- Back-cavity feature spec: `docs/superpowers/specs/2026-06-10-back-cavity-design.md` (current with code).
- Cable-holes feature spec: `docs/superpowers/specs/2026-06-10-cable-holes-design.md` (current with code).
- Mounting-features feature spec: `docs/superpowers/specs/2026-06-10-mounting-features-design.md` (current with code).
- Viewer-improvements feature spec: `docs/superpowers/specs/2026-06-11-viewer-improvements-design.md` (current with code).
- Bulb-holes feature spec: `docs/superpowers/specs/2026-06-11-bulb-holes-design.md` (current with code).
- Implementation plan in `docs/superpowers/plans/` is **historical** — frozen at v1, contains stale references (e.g. `rabbetLipWidth`). Treat as an artifact; don't update.

## Working with this code

- Run `npm test` and `npm run lint` after substantive changes; the e2e is fast (~3s with cold WASM).
- Prefer editing existing files; the layout is settled.
- Never reintroduce the manifest.json, the four-layer SVG export, or shadow rendering without explicit user consent.
