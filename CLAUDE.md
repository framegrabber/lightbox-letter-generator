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

- Letters lay flat in the XY plane, extruded along **+Z**. Back face at `Z=0`, front at `Z=totalDepth`.
- After `flatten.ts`'s Y-flip, the **letter top is at NEGATIVE Y** (opentype +Y up → our −Y up).
- Outer contours emerge CCW, holes CW (via point-in-polygon parity correction in `flatten.ts`).
- Camera is **Z-up** (`camera.up = (0, 0, 1)`). Auto-fit constants are at the top of `PreviewCanvas.tsx` (target fraction, dist multiplier, direction).

## Plexi/rabbet semantics — `insetWidth` (not lip width)

- `insetWidth` = the SHELF width (where the plexi rests). Not the visible lip from the outer edge.
- Visible lip width = `wallThickness − insetWidth` (computed; not a stored param).
- Validation: `0 < insetWidth < wallThickness`. Equal collapses the lip; greater inverts the geometry (cavity hole then contains the rabbet hole and the rabbet contributes nothing).
- Geometry: `rabbetCut = outer.offset(-(wallThickness − insetWidth), "Round")`.
- Legacy URL/localStorage saves used `rabbetLipWidth`; `persistence.ts` `migrate()` translates them.

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

`bridgeY` defaults to `-letterHeight / 2` because letters span `Y ∈ [-letterHeight, 0]` after `flatten.ts`'s Y-flip. The default does not auto-update when `letterHeight` changes; an intentional user value is preserved.

## `NumberField` behaviour

Local string state lets the user clear the input or type intermediate values like `"5."` without the controlled value snapping back. Commits to `onChange` whenever the text parses to a finite number; snaps back to the prop value only on blur if unparseable. Don't simplify back to a plain controlled input — that brought back "I can't clear the field to retype".

## Bundled fonts

- 8 fonts in `public/fonts/`, registered in `src/fonts/bundled.ts`. **Anton is the default.**
- **Montserrat must be the STATIC Regular** from `JulietaUla/Montserrat`. The Google Fonts variable build (`Montserrat[wght].ttf`) parses to near-skeleton outlines via opentype.js (~5× too thin) and breaks offset operations. See `swap Montserrat variable for static Regular` in git history.
- Fonts are fetched lazily — only the selected font hits the network on initial load.

## Preview shading

- `PreviewLetter.tsx` calls `toNonIndexed()` **before** `computeVertexNormals()`. Each triangle then has its own vertices, so normals match each face — crisp 90° creases. Don't drop this; default smooth shading rounds every corner.
- Plexi uses `MeshPhysicalMaterial` with `transmission: 0.6, thickness: 2, roughness: 0.85, ior: 1.49, opacity: 0.55, depthWrite: false`. The `depthWrite: false` is load-bearing — without it the shell behind the plexi disappears.

## Export format

```
lightbox-<timestamp>.zip
├── README.txt              # human-readable params + reproduce URL
├── stl/01_<chars>.stl …    # 3D shells (one per connected component)
└── plexi/01_<chars>.svg …  # plexi cut shapes only
```

- One entry point: `bundleAll(stls, plexis, readme)`.
- `buildReadme(params, reproduceUrl)` produces the README text. The reproduce URL is built from `window.location.origin + window.location.pathname + "?p=" + JSON.stringify(serializableParams)` in `ExportButtons`.
- `<chars>` is the joined member chars per component (e.g. `BURGER` if all letters merge, `H`/`i` if they don't), sanitized to `[A-Za-z0-9_-]`. Empty/all-non-ASCII fallback is `componentNN`. The README's "Pieces" section enumerates the slots.
- The earlier four-layer SVG export (back/wall/rabbet/plexi) and `manifest.json` are GONE. Don't reintroduce them without an explicit ask.

## Tests

- 69 Vitest unit tests, mirrors the `src/` layout under `tests/unit/`.
- `tests/e2e/smoke.spec.ts` exercises full type → download. It sets explicit params (text, height, wall thickness, inset) so it doesn't depend on the current defaults — when defaults change, the test still passes. It asserts the zip layout (`stl/`, `plexi/`, `README.txt`, no `manifest.json`).
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
- Implementation plan in `docs/superpowers/plans/` is **historical** — frozen at v1, contains stale references (e.g. `rabbetLipWidth`). Treat as an artifact; don't update.

## Working with this code

- Run `npm test` and `npm run lint` after substantive changes; the e2e is fast (~3s with cold WASM).
- Prefer editing existing files; the layout is settled.
- Never reintroduce the manifest.json, the four-layer SVG export, or shadow rendering without explicit user consent.
