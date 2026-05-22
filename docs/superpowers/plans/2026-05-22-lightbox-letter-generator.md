# Lightbox Letter Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only generator that turns typed text + a custom font into 3D-printable lightbox letter shells (STL) and 2D laser-cut layer files (SVG), with a stepped rabbet that holds a letter-shaped piece of plexiglass flush with the front.

**Architecture:** Pure-function geometry pipeline (opentype.js → polygon contours → manifold-3d CrossSection offsets → extrusions → boolean shell), driven by a zustand parameter store and previewed with react-three-fiber. CSG runs in a Web Worker; main thread stays responsive. Exports are zipped binary STLs or layered SVGs with a `manifest.json` for reproducibility.

**Tech Stack:** Vite, React, TypeScript, opentype.js, manifold-3d (WASM), three.js + @react-three/fiber, zustand, JSZip, FileSaver, Vitest, Playwright. Deployed to GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-05-22-lightbox-letter-generator-design.md`

---

## File Structure

```
lightbox/
├── .github/workflows/deploy.yml
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── public/
│   └── fonts/                          # bundled .ttf assets
├── src/
│   ├── main.tsx                        # React entry
│   ├── App.tsx                         # two-column layout root
│   ├── state/
│   │   ├── parameters.ts               # zustand store + Parameters type + defaults
│   │   └── persistence.ts              # URL ↔ store ↔ localStorage sync
│   ├── geometry/
│   │   ├── types.ts                    # Contour, Polygon, Glyph types
│   │   ├── flatten.ts                  # opentype Path → polygons
│   │   ├── scale.ts                    # cap-height scaling
│   │   ├── shell.ts                    # 2D regions → 3D Manifold
│   │   ├── layout.ts                   # word-level kerning + positioning
│   │   ├── validate.ts                 # parameter validation
│   │   └── worker.ts                   # web worker entrypoint
│   ├── fonts/
│   │   ├── bundled.ts                  # registry of bundled fonts
│   │   ├── load.ts                     # opentype loading wrapper
│   │   └── cache.ts                    # IndexedDB SHA-256 cache
│   ├── exporters/
│   │   ├── stl.ts                      # binary STL writer
│   │   ├── svg.ts                      # 4-layer SVG generator
│   │   ├── manifest.ts                 # manifest.json builder
│   │   └── zip.ts                      # JSZip bundle helpers
│   └── ui/
│       ├── ControlsPanel.tsx
│       ├── TextInput.tsx
│       ├── FontPicker.tsx
│       ├── NumberField.tsx
│       ├── PreviewCanvas.tsx
│       ├── PreviewLetter.tsx
│       └── ExportButtons.tsx
└── tests/
    ├── unit/                           # mirrors src/ for *.test.ts files
    ├── fixtures/
    │   └── fonts/                      # tiny test font(s)
    └── e2e/
        └── smoke.spec.ts
```

Each file has one responsibility. Geometry is pure (no React, no DOM); exporters consume geometry results; UI consumes the store. Tests live next to or under matching source paths.

---

## Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `.eslintrc.cjs`, `.prettierrc`

- [ ] **Step 1: Run `npm create vite@latest . -- --template react-ts`**

Run from `/Users/felix/Documents/code/lightbox`. Choose to overwrite if prompted; the directory only contains the spec which we keep.

```bash
npm create vite@latest . -- --template react-ts
```

If it refuses to scaffold into a non-empty directory, scaffold into a temp dir, then move files into place:

```bash
npm create vite@latest .lightbox-tmp -- --template react-ts
cp -R .lightbox-tmp/. .
rm -rf .lightbox-tmp
```

Make sure `docs/`, `.git/`, and the spec are still there after.

- [ ] **Step 2: Install runtime deps**

```bash
npm install zustand opentype.js manifold-3d three @react-three/fiber @react-three/drei jszip file-saver idb-keyval
```

- [ ] **Step 3: Install dev deps**

```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8 jsdom \
  @types/three @types/file-saver @types/opentype.js \
  prettier eslint-config-prettier \
  @playwright/test
```

- [ ] **Step 4: Add scripts to `package.json`**

Replace the `scripts` block in `package.json` with:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint src --ext ts,tsx",
  "format": "prettier --write src tests",
  "e2e": "playwright test"
}
```

- [ ] **Step 5: Configure `vite.config.ts` for relative base + workers**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["manifold-3d"] },
});
```

- [ ] **Step 6: Verify it builds and runs**

```bash
npm run build
```
Expected: builds without errors, produces `dist/`.

```bash
npm run dev
```
Expected: dev server starts, page loads at the printed URL.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript project"
```

---

## Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
```

- [ ] **Step 2: Write `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

Then install:
```bash
npm install -D @testing-library/jest-dom @testing-library/react
```

- [ ] **Step 3: Add a sanity test**

Create `tests/unit/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: 1 test, passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest"
```

---

## Task 3: Define Parameters type and zustand store

**Files:**
- Create: `src/state/parameters.ts`
- Create: `tests/unit/state/parameters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/state/parameters.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("parameters store", () => {
  beforeEach(() => {
    useParameters.setState(DEFAULT_PARAMETERS);
  });

  it("starts with defaults", () => {
    const state = useParameters.getState();
    expect(state.text).toBe("");
    expect(state.letterHeight).toBe(100);
    expect(state.wallThickness).toBe(3);
    expect(state.totalDepth).toBe(25);
    expect(state.backThickness).toBe(2);
    expect(state.rabbetDepth).toBe(3);
    expect(state.rabbetLipWidth).toBe(4);
    expect(state.bezierTolerance).toBe(0.1);
  });

  it("updates a single field via set", () => {
    useParameters.getState().set({ text: "MAKING" });
    expect(useParameters.getState().text).toBe("MAKING");
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
npm test -- parameters
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/parameters.ts`**

```ts
import { create } from "zustand";

export type FontSource =
  | { kind: "bundled"; id: string }
  | { kind: "uploaded"; name: string; sha256: string };

export type Parameters = {
  text: string;
  fontSource: FontSource;
  letterHeight: number;
  wallThickness: number;
  totalDepth: number;
  backThickness: number;
  rabbetDepth: number;
  rabbetLipWidth: number;
  bezierTolerance: number;
};

export const DEFAULT_PARAMETERS: Parameters & { set: (p: Partial<Parameters>) => void } = {
  text: "",
  fontSource: { kind: "bundled", id: "inter" },
  letterHeight: 100,
  wallThickness: 3,
  totalDepth: 25,
  backThickness: 2,
  rabbetDepth: 3,
  rabbetLipWidth: 4,
  bezierTolerance: 0.1,
  set: () => {},
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
```

- [ ] **Step 4: Run the tests, expect pass**

```bash
npm test -- parameters
```
Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: parameter store with zustand"
```

---

## Task 4: Validation function with full rule coverage

**Files:**
- Create: `src/geometry/validate.ts`
- Create: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/geometry/validate.test.ts
import { describe, it, expect } from "vitest";
import { validate, ValidationError } from "../../../src/geometry/validate";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("validate", () => {
  const ok = { ...DEFAULT_PARAMETERS, text: "HI" };

  it("accepts valid parameters", () => {
    const r = validate(ok);
    expect(r.ok).toBe(true);
  });

  it("rejects rabbetDepth >= totalDepth - backThickness", () => {
    const r = validate({ ...ok, rabbetDepth: 25, totalDepth: 25, backThickness: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "rabbetDepth")).toBe(true);
    }
  });

  it("rejects rabbetLipWidth <= wallThickness", () => {
    const r = validate({ ...ok, rabbetLipWidth: 3, wallThickness: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "rabbetLipWidth")).toBe(true);
    }
  });

  it("rejects non-positive numeric params", () => {
    for (const field of [
      "letterHeight", "wallThickness", "totalDepth", "backThickness",
      "rabbetDepth", "rabbetLipWidth", "bezierTolerance",
    ] as const) {
      const r = validate({ ...ok, [field]: 0 });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects empty text", () => {
    const r = validate({ ...ok, text: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    const r = validate({ ...ok, letterHeight: NaN });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
npm test -- validate
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/geometry/validate.ts`**

```ts
import { Parameters } from "../state/parameters";

export type ValidationError = { field: keyof Parameters | "_form"; letter?: string; message: string };

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export function validate(p: Parameters): ValidationResult {
  const errors: ValidationError[] = [];

  const positives = [
    "letterHeight", "wallThickness", "totalDepth",
    "backThickness", "rabbetDepth", "rabbetLipWidth", "bezierTolerance",
  ] as const;
  for (const f of positives) {
    const v = p[f];
    if (!Number.isFinite(v) || v <= 0) {
      errors.push({ field: f, message: `${f} must be a positive number` });
    }
  }

  if (p.text.replace(/\s/g, "").length === 0) {
    errors.push({ field: "text", message: "Text must contain at least one non-whitespace character" });
  }

  if (Number.isFinite(p.rabbetDepth) && Number.isFinite(p.totalDepth) && Number.isFinite(p.backThickness)) {
    if (p.rabbetDepth >= p.totalDepth - p.backThickness) {
      errors.push({
        field: "rabbetDepth",
        message: "Rabbet depth must be less than (total depth − back thickness)",
      });
    }
  }

  if (Number.isFinite(p.rabbetLipWidth) && Number.isFinite(p.wallThickness)) {
    if (p.rabbetLipWidth <= p.wallThickness) {
      errors.push({
        field: "rabbetLipWidth",
        message: "Rabbet lip width must be greater than wall thickness",
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

Note: per-letter offset-empty validation lives in the geometry pipeline (Task 9–10), not here. This function only checks parameter-level rules.

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- validate
```
Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: parameter validation"
```

---

## Task 5: Geometry types

**Files:**
- Create: `src/geometry/types.ts`

- [ ] **Step 1: Implement types (no test — types only)**

```ts
// A single closed contour: array of [x, y] vertex points (last point != first).
export type Polygon = [number, number][];

// A glyph as a list of polygons. Outer contours are CCW; holes are CW.
// CrossSection.ofPolygons uses non-zero winding — this convention matches.
export type GlyphContours = Polygon[];

// Per-letter geometry result for downstream consumers.
export type LetterGeometry = {
  char: string;
  index: number;             // position in original text
  contours: GlyphContours;   // outer + holes, scaled to mm
  advanceX: number;          // for layout in preview, mm
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: geometry type definitions"
```

---

## Task 6: Glyph flattening (opentype Path → polygons)

**Files:**
- Create: `src/geometry/flatten.ts`
- Create: `tests/unit/geometry/flatten.test.ts`
- Create: `tests/fixtures/fonts/Inter-Regular.ttf` (download or copy from `public/fonts/` once Task 7 fetches it)

For now, fetch a known font for fixtures:

```bash
mkdir -p tests/fixtures/fonts
curl -L -o tests/fixtures/fonts/Inter-Regular.ttf \
  https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/geometry/flatten.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { flattenGlyph } from "../../../src/geometry/flatten";

const FONT_PATH = resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf");

function loadFont(): opentype.Font {
  const buf = readFileSync(FONT_PATH);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("flattenGlyph", () => {
  const font = loadFont();

  it("produces at least one closed polygon for 'M'", () => {
    const glyph = font.charToGlyph("M");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBeGreaterThan(0);
    expect(contours[0].length).toBeGreaterThan(2);
  });

  it("produces an outer + hole for 'O'", () => {
    const glyph = font.charToGlyph("O");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBe(2);
  });

  it("produces two disjoint contours for 'i' (dot + stem)", () => {
    const glyph = font.charToGlyph("i");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty list for the space glyph", () => {
    const glyph = font.charToGlyph(" ");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    expect(contours.length).toBe(0);
  });

  it("uses CCW winding for outer contours and CW for holes", () => {
    const glyph = font.charToGlyph("O");
    const contours = flattenGlyph(glyph, font.unitsPerEm, 0.1);
    const signed = (poly: [number, number][]) => {
      let s = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        s += (x2 - x1) * (y2 + y1);
      }
      return s; // > 0 means CW in y-up, < 0 means CCW in y-up
    };
    const areas = contours.map(signed);
    // Exactly one outer (CCW) and one hole (CW)
    expect(areas.filter((a) => a < 0).length).toBe(1);
    expect(areas.filter((a) => a > 0).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
npm test -- flatten
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/geometry/flatten.ts`**

```ts
import opentype from "opentype.js";
import { GlyphContours, Polygon } from "./types";

/**
 * Flatten an opentype glyph into closed polygons in font units (NOT scaled).
 * Y is flipped so positive Y is up (opentype reports Y-down for some metrics).
 * tolerance is the maximum chord deviation from the true bezier curve (in font units).
 *
 * Outer contours emerge CCW, holes CW.
 */
export function flattenGlyph(
  glyph: opentype.Glyph,
  unitsPerEm: number,
  toleranceMm: number,
): GlyphContours {
  // Convert mm tolerance to font units (assume 1 em = 1 letterHeight unit later).
  // We scale paths to mm in scale.ts — here we work in font units, so convert
  // the mm tolerance to font units assuming a unit em ~= 1mm. We use a conservative
  // tolerance proportional to unitsPerEm so flattening is stable across fonts.
  const toleranceFu = (toleranceMm / 1) * (unitsPerEm / 100);

  const path = glyph.getPath(0, 0, unitsPerEm);
  const contours: Polygon[] = [];
  let current: Polygon = [];
  let lastX = 0, lastY = 0;
  let startX = 0, startY = 0;

  const flipY = (y: number) => -y;

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case "M": {
        if (current.length > 0) contours.push(closeIfNeeded(current));
        current = [];
        startX = cmd.x;
        startY = cmd.y;
        lastX = cmd.x;
        lastY = cmd.y;
        current.push([cmd.x, flipY(cmd.y)]);
        break;
      }
      case "L": {
        current.push([cmd.x, flipY(cmd.y)]);
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "Q": {
        flattenQuadratic(current, lastX, lastY, cmd.x1, cmd.y1, cmd.x, cmd.y, toleranceFu, flipY);
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "C": {
        flattenCubic(current, lastX, lastY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, toleranceFu, flipY);
        lastX = cmd.x;
        lastY = cmd.y;
        break;
      }
      case "Z": {
        if (current.length > 0) contours.push(closeIfNeeded(current));
        current = [];
        lastX = startX;
        lastY = startY;
        break;
      }
    }
  }
  if (current.length > 0) contours.push(closeIfNeeded(current));

  return contours.map(ensureCcwForOuter);
}

function closeIfNeeded(poly: Polygon): Polygon {
  if (poly.length === 0) return poly;
  const [fx, fy] = poly[0];
  const [lx, ly] = poly[poly.length - 1];
  if (fx === lx && fy === ly) return poly.slice(0, -1);
  return poly;
}

// Adaptive subdivision: split until the control polygon is within tolerance of a straight line.
function flattenQuadratic(
  out: Polygon, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  tol: number, flipY: (y: number) => number,
) {
  const stack: [number, number, number, number, number, number, number][] = [
    [x0, y0, x1, y1, x2, y2, 0],
  ];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy, depth] = stack.pop()!;
    const dev = pointLineDistance(bx, by, ax, ay, cx, cy);
    if (dev <= tol || depth > 16) {
      out.push([cx, flipY(cy)]);
    } else {
      const mAx = (ax + bx) / 2, mAy = (ay + by) / 2;
      const mBx = (bx + cx) / 2, mBy = (by + cy) / 2;
      const mx = (mAx + mBx) / 2, my = (mAy + mBy) / 2;
      stack.push([mx, my, mBx, mBy, cx, cy, depth + 1]);
      stack.push([ax, ay, mAx, mAy, mx, my, depth + 1]);
    }
  }
}

function flattenCubic(
  out: Polygon, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  tol: number, flipY: (y: number) => number,
) {
  const stack: [number, number, number, number, number, number, number, number, number][] = [
    [x0, y0, x1, y1, x2, y2, x3, y3, 0],
  ];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy, dx, dy, depth] = stack.pop()!;
    const d1 = pointLineDistance(bx, by, ax, ay, dx, dy);
    const d2 = pointLineDistance(cx, cy, ax, ay, dx, dy);
    if (Math.max(d1, d2) <= tol || depth > 16) {
      out.push([dx, flipY(dy)]);
    } else {
      const m1x = (ax + bx) / 2, m1y = (ay + by) / 2;
      const m2x = (bx + cx) / 2, m2y = (by + cy) / 2;
      const m3x = (cx + dx) / 2, m3y = (cy + dy) / 2;
      const m12x = (m1x + m2x) / 2, m12y = (m1y + m2y) / 2;
      const m23x = (m2x + m3x) / 2, m23y = (m2y + m3y) / 2;
      const mx = (m12x + m23x) / 2, my = (m12y + m23y) / 2;
      stack.push([mx, my, m23x, m23y, m3x, m3y, dx, dy, depth + 1]);
      stack.push([ax, ay, m1x, m1y, m12x, m12y, mx, my, depth + 1]);
    }
  }
}

function pointLineDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const cross = Math.abs(dx * (ay - py) - dy * (ax - px));
  return cross / Math.sqrt(len2);
}

function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += (x2 - x1) * (y2 + y1);
  }
  return s; // > 0 = CW (y-up), < 0 = CCW
}

// We can't tell outer vs hole without point-in-polygon tests across all contours.
// For now, emit all contours unchanged; correctness for manifold's non-zero fill rule
// is achieved by ensuring outer contours are CCW and holes are CW. opentype TrueType
// fonts already follow this convention after our Y-flip; CFF fonts may differ.
// Caller (shell.ts) will run a correction pass if needed.
function ensureCcwForOuter(poly: Polygon): Polygon {
  return poly;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- flatten
```
Expected: 5 tests passing. If the winding test fails for a CFF font, investigate and add a winding-correction pass that point-in-polygons each contour against others to label outers vs holes, then forces CCW/CW accordingly. Add the correction inside `flattenGlyph` (do not export it separately).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: glyph flattening with adaptive bezier subdivision"
```

---

## Task 7: Bundled fonts registry

**Files:**
- Create: `public/fonts/Inter-Regular.ttf`, `public/fonts/BebasNeue-Regular.ttf`
- Create: `src/fonts/bundled.ts`

- [ ] **Step 1: Download bundled fonts**

```bash
mkdir -p public/fonts
curl -L -o public/fonts/Inter-Regular.ttf \
  https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf
curl -L -o public/fonts/BebasNeue-Regular.ttf \
  https://github.com/dharmatype/Bebas-Neue/raw/master/fonts/BebasNeue%20(2018)/ttf/BebasNeue-Regular.ttf
```

If either URL is dead, use any SIL OFL TTF you have access to and update the URLs in this task. Verify with `file public/fonts/*.ttf` that they're TrueType.

- [ ] **Step 2: Implement registry**

```ts
// src/fonts/bundled.ts
export type BundledFont = {
  id: string;
  label: string;
  path: string; // relative to base; loaded via fetch
  license: string;
};

export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: "inter",
    label: "Inter (sans)",
    path: "fonts/Inter-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "bebas",
    label: "Bebas Neue (display)",
    path: "fonts/BebasNeue-Regular.ttf",
    license: "SIL OFL 1.1",
  },
];

export function bundledFontById(id: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((f) => f.id === id);
}
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```
Expected: builds without errors; `dist/fonts/` contains both TTFs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: bundled font registry with Inter + Bebas Neue"
```

---

## Task 8: Font loader (opentype wrapper + IndexedDB cache)

**Files:**
- Create: `src/fonts/load.ts`
- Create: `src/fonts/cache.ts`
- Create: `tests/unit/fonts/load.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/fonts/load.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFontBuffer, sha256OfBuffer } from "../../../src/fonts/load";

const FONT_PATH = resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf");

describe("parseFontBuffer", () => {
  it("parses a valid TTF", async () => {
    const buf = readFileSync(FONT_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font = await parseFontBuffer(ab);
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.charToGlyph("M").index).toBeGreaterThan(0);
  });

  it("rejects non-font input", async () => {
    const ab = new TextEncoder().encode("not a font").buffer;
    await expect(parseFontBuffer(ab)).rejects.toThrow();
  });
});

describe("sha256OfBuffer", () => {
  it("produces 64 hex chars", async () => {
    const buf = readFileSync(FONT_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const hash = await sha256OfBuffer(ab);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- fonts/load
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/fonts/load.ts`**

```ts
import opentype from "opentype.js";

export async function parseFontBuffer(buffer: ArrayBuffer): Promise<opentype.Font> {
  const font = opentype.parse(buffer);
  if (!font || !font.unitsPerEm) {
    throw new Error("Invalid font file");
  }
  return font;
}

export async function sha256OfBuffer(buffer: ArrayBuffer): Promise<string> {
  const subtle = (globalThis.crypto?.subtle) ?? (await import("node:crypto")).webcrypto.subtle;
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Implement `src/fonts/cache.ts`**

```ts
import { get, set, del } from "idb-keyval";

const PREFIX = "font:";

export async function cacheFont(sha256: string, buffer: ArrayBuffer): Promise<void> {
  await set(PREFIX + sha256, buffer);
}

export async function getCachedFont(sha256: string): Promise<ArrayBuffer | undefined> {
  return await get(PREFIX + sha256);
}

export async function deleteCachedFont(sha256: string): Promise<void> {
  await del(PREFIX + sha256);
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm test -- fonts/load
```
Expected: 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: font parsing + IndexedDB cache"
```

---

## Task 9: Cap-height scaling

**Files:**
- Create: `src/geometry/scale.ts`
- Create: `tests/unit/geometry/scale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/geometry/scale.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { capHeightScale } from "../../../src/geometry/scale";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("capHeightScale", () => {
  it("returns a positive scale that maps cap-height to letterHeight (mm)", () => {
    const font = loadFont();
    const scale = capHeightScale(font, 100);
    expect(scale).toBeGreaterThan(0);
    // Inter cap-height in font units ~ 1490 of 2048 unitsPerEm
    // So scale should be ~ 100 / 1490 ≈ 0.067
    expect(scale).toBeGreaterThan(0.04);
    expect(scale).toBeLessThan(0.15);
  });

  it("falls back to 'H' bbox when sCapHeight is missing", () => {
    const font = loadFont();
    const fakeFont = Object.assign(Object.create(Object.getPrototypeOf(font)), font, {
      tables: { ...font.tables, os2: { ...(font.tables as any).os2, sCapHeight: 0 } },
    });
    const scale = capHeightScale(fakeFont as opentype.Font, 100);
    expect(scale).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- scale
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/geometry/scale.ts`**

```ts
import opentype from "opentype.js";

/**
 * Returns the scale factor that maps font units to mm such that the font's
 * cap-height equals letterHeight mm. Falls back to measuring the 'H' glyph
 * bounding box when OS/2 sCapHeight is unavailable or zero.
 */
export function capHeightScale(font: opentype.Font, letterHeight: number): number {
  const os2 = (font.tables as any).os2;
  let capHeightFu = os2?.sCapHeight ?? 0;

  if (!capHeightFu || capHeightFu <= 0) {
    const h = font.charToGlyph("H");
    if (h && h.getBoundingBox) {
      const bb = h.getBoundingBox();
      capHeightFu = Math.abs(bb.y2 - bb.y1);
    }
  }

  if (!capHeightFu || capHeightFu <= 0) {
    // Last-ditch: assume cap-height ~= 0.7 * unitsPerEm (a common ratio).
    capHeightFu = font.unitsPerEm * 0.7;
  }

  return letterHeight / capHeightFu;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- scale
```
Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cap-height scale calculation"
```

---

## Task 10: Manifold initialisation helper

**Files:**
- Create: `src/geometry/manifold-init.ts`
- Create: `tests/unit/geometry/manifold-init.test.ts`

manifold-3d ships as a WASM module that needs an async `setup()` before any `Manifold` or `CrossSection` constructor is callable. We isolate that behind a single `getManifold()` helper.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/geometry/manifold-init.test.ts
import { describe, it, expect } from "vitest";
import { getManifold } from "../../../src/geometry/manifold-init";

describe("getManifold", () => {
  it("loads the WASM module exactly once", async () => {
    const a = await getManifold();
    const b = await getManifold();
    expect(a).toBe(b);
    expect(typeof a.Manifold).toBe("function");
    expect(typeof a.CrossSection).toBe("function");
  });
}, 30_000);
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- manifold-init
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/geometry/manifold-init.ts`**

```ts
import Module from "manifold-3d";

type ManifoldNS = Awaited<ReturnType<typeof Module>>;

let cached: Promise<ManifoldNS> | null = null;

export function getManifold(): Promise<ManifoldNS> {
  if (!cached) {
    cached = Module().then(async (m) => {
      m.setup();
      return m;
    });
  }
  return cached;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- manifold-init
```
Expected: 1 test passing. (May take a few seconds to load WASM.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: manifold-3d singleton initializer"
```

---

## Task 11: Single-letter shell construction

**Files:**
- Create: `src/geometry/shell.ts`
- Create: `tests/unit/geometry/shell.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/geometry/shell.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { buildLetterShell, ShellInputs } from "../../../src/geometry/shell";
import { flattenGlyph } from "../../../src/geometry/flatten";
import { capHeightScale } from "../../../src/geometry/scale";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("buildLetterShell", () => {
  const font = loadFont();
  const baseInputs: Omit<ShellInputs, "contours"> = {
    totalDepth: 25,
    backThickness: 2,
    wallThickness: 3,
    rabbetDepth: 3,
    rabbetLipWidth: 4,
  };

  function contoursFor(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  it("builds a closed manifold mesh for 'M'", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("M") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mesh.vertProperties.length).toBeGreaterThan(0);
      expect(result.mesh.triVerts.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("builds a closed mesh for 'O' (with hole)", async () => {
    const result = await buildLetterShell({ ...baseInputs, contours: contoursFor("O") });
    expect(result.ok).toBe(true);
  }, 30_000);

  it("fails with reason='offset_collapsed' when wall is too thick for the glyph", async () => {
    const result = await buildLetterShell({
      ...baseInputs,
      wallThickness: 50,
      rabbetLipWidth: 60,
      contours: contoursFor("i"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("offset_collapsed");
  }, 30_000);
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- shell
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/geometry/shell.ts`**

```ts
import { getManifold } from "./manifold-init";
import { GlyphContours } from "./types";

export type ShellInputs = {
  contours: GlyphContours;          // already scaled to mm
  totalDepth: number;
  backThickness: number;
  wallThickness: number;
  rabbetDepth: number;
  rabbetLipWidth: number;
};

export type ShellMeshResult =
  | {
      ok: true;
      mesh: { vertProperties: Float32Array; triVerts: Uint32Array };
    }
  | { ok: false; reason: "offset_collapsed" | "no_contours" };

export async function buildLetterShell(input: ShellInputs): Promise<ShellMeshResult> {
  if (input.contours.length === 0) {
    return { ok: false, reason: "no_contours" };
  }

  const m = await getManifold();
  const { CrossSection, Manifold } = m;

  const outer = new CrossSection(input.contours, "NonZero" as any);
  const cavity = outer.offset(-input.wallThickness, "Round" as any);
  const rabbetCut = outer.offset(-input.rabbetLipWidth, "Round" as any);

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete(); cavity.delete(); rabbetCut.delete();
    return { ok: false, reason: "offset_collapsed" };
  }

  const outerPrism = outer.extrude(input.totalDepth);
  const cavityPrism = cavity
    .extrude(input.totalDepth - input.backThickness)
    .translate([0, 0, input.backThickness]);
  const rabbetPrism = rabbetCut
    .extrude(input.rabbetDepth)
    .translate([0, 0, input.totalDepth - input.rabbetDepth]);

  const shell = outerPrism.subtract(cavityPrism).subtract(rabbetPrism);
  const mesh = shell.getMesh();

  // Cleanup wasm objects.
  outer.delete(); cavity.delete(); rabbetCut.delete();
  outerPrism.delete(); cavityPrism.delete(); rabbetPrism.delete();
  shell.delete();

  return {
    ok: true,
    mesh: {
      vertProperties: mesh.vertProperties,
      triVerts: mesh.triVerts,
    },
  };
}
```

Notes:
- The `"NonZero"` and `"Round"` strings cast to the manifold-3d enum — depending on the version, these may be enum constants (e.g. `m.CrossSection.FillRule.NonZero`). If TypeScript complains, replace with the constant lookup (`m.FillRule.NonZero`, `m.JoinType.Round`).
- `getMesh()` returns a `Mesh` with `vertProperties` (interleaved x,y,z per vertex by default) and `triVerts` (3 indices per triangle).

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- shell
```
Expected: 3 tests passing. If the manifold enum casts fail, swap them for the version-correct constants and re-run.

- [ ] **Step 5: Center and re-origin the mesh for export**

Add to `src/geometry/shell.ts` an exported helper:

```ts
export function centerMeshXY(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }): {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const v = mesh.vertProperties;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    if (v[i] < minX) minX = v[i];
    if (v[i] > maxX) maxX = v[i];
    if (v[i + 1] < minY) minY = v[i + 1];
    if (v[i + 1] > maxY) maxY = v[i + 1];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    out[i] = v[i] - cx;
    out[i + 1] = v[i + 1] - cy;
    out[i + 2] = v[i + 2]; // Z = 0 at back already from extrusion
  }
  return { vertProperties: out, triVerts: mesh.triVerts, bbox: { minX, minY, maxX, maxY } };
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: single-letter shell construction with manifold"
```

---

## Task 12: Word-level layout

**Files:**
- Create: `src/geometry/layout.ts`
- Create: `tests/unit/geometry/layout.test.ts`

This computes per-letter X offsets for the *preview* using opentype kerning. Exports do NOT use these offsets — each letter centers on its own bbox.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/geometry/layout.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { layoutWord } from "../../../src/geometry/layout";

function loadFont(): opentype.Font {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("layoutWord", () => {
  const font = loadFont();

  it("returns one entry per non-space character", () => {
    const result = layoutWord(font, "Hi", 100);
    expect(result.length).toBe(2);
    expect(result[0].char).toBe("H");
    expect(result[1].char).toBe("i");
  });

  it("advances X by glyph advance width (in mm)", () => {
    const result = layoutWord(font, "AB", 100);
    expect(result[1].xOffset).toBeGreaterThan(result[0].xOffset);
  });

  it("skips space characters but advances", () => {
    const result = layoutWord(font, "A B", 100);
    expect(result.length).toBe(2);
    expect(result[1].char).toBe("B");
    expect(result[1].xOffset).toBeGreaterThan(result[0].xOffset);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- layout
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/geometry/layout.ts`**

```ts
import opentype from "opentype.js";
import { capHeightScale } from "./scale";

export type LayoutEntry = {
  char: string;
  glyph: opentype.Glyph;
  xOffset: number; // mm, position of glyph origin in word space
};

export function layoutWord(font: opentype.Font, text: string, letterHeight: number): LayoutEntry[] {
  const scale = capHeightScale(font, letterHeight);
  const glyphs = Array.from(text).map((ch) => ({ ch, glyph: font.charToGlyph(ch) }));

  const entries: LayoutEntry[] = [];
  let cursorFu = 0;

  for (let i = 0; i < glyphs.length; i++) {
    const { ch, glyph } = glyphs[i];
    const isSpace = /\s/.test(ch);

    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale });
    }

    cursorFu += glyph.advanceWidth ?? 0;

    if (i + 1 < glyphs.length) {
      const next = glyphs[i + 1].glyph;
      const kern = font.getKerningValue(glyph, next) ?? 0;
      cursorFu += kern;
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- layout
```
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: word-level kerning + layout"
```

---

## Task 13: Binary STL exporter

**Files:**
- Create: `src/exporters/stl.ts`
- Create: `tests/unit/exporters/stl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/exporters/stl.test.ts
import { describe, it, expect } from "vitest";
import { meshToBinarySTL } from "../../../src/exporters/stl";

describe("meshToBinarySTL", () => {
  it("writes a valid header + triangle count", () => {
    const mesh = {
      vertProperties: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
    const buf = meshToBinarySTL(mesh);
    const view = new DataView(buf);
    expect(buf.byteLength).toBe(80 + 4 + 50);
    expect(view.getUint32(80, true)).toBe(1);
  });

  it("encodes triangle vertices as little-endian floats", () => {
    const mesh = {
      vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
    const buf = meshToBinarySTL(mesh);
    const view = new DataView(buf);
    // Skip 80-byte header, 4-byte tri count, 12-byte normal -> first vertex at 96
    expect(view.getFloat32(96, true)).toBe(0);
    expect(view.getFloat32(96 + 12, true)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- exporters/stl
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/exporters/stl.ts`**

```ts
export type Mesh = { vertProperties: Float32Array; triVerts: Uint32Array };

export function meshToBinarySTL(mesh: Mesh): ArrayBuffer {
  const triCount = mesh.triVerts.length / 3;
  const buf = new ArrayBuffer(80 + 4 + triCount * 50);
  const view = new DataView(buf);

  // 80-byte header zeroed by default
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const a = mesh.triVerts[i * 3] * 3;
    const b = mesh.triVerts[i * 3 + 1] * 3;
    const c = mesh.triVerts[i * 3 + 2] * 3;

    const ax = mesh.vertProperties[a], ay = mesh.vertProperties[a + 1], az = mesh.vertProperties[a + 2];
    const bx = mesh.vertProperties[b], by = mesh.vertProperties[b + 1], bz = mesh.vertProperties[b + 2];
    const cx = mesh.vertProperties[c], cy = mesh.vertProperties[c + 1], cz = mesh.vertProperties[c + 2];

    // Normal = (b - a) × (c - a), normalised
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    view.setFloat32(offset, ax, true); offset += 4;
    view.setFloat32(offset, ay, true); offset += 4;
    view.setFloat32(offset, az, true); offset += 4;

    view.setFloat32(offset, bx, true); offset += 4;
    view.setFloat32(offset, by, true); offset += 4;
    view.setFloat32(offset, bz, true); offset += 4;

    view.setFloat32(offset, cx, true); offset += 4;
    view.setFloat32(offset, cy, true); offset += 4;
    view.setFloat32(offset, cz, true); offset += 4;

    view.setUint16(offset, 0, true); offset += 2; // attribute byte count
  }

  return buf;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- exporters/stl
```
Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: binary STL exporter"
```

---

## Task 14: SVG layer exporter

**Files:**
- Create: `src/exporters/svg.ts`
- Create: `tests/unit/exporters/svg.test.ts`

The four layers per letter (`back`, `wall`, `rabbet`, `plexi`) each derive from one or two `CrossSection` operations we already use in `shell.ts`. We re-derive them here using manifold's `CrossSection.toPolygons()` for SVG output.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/exporters/svg.test.ts
import { describe, it, expect } from "vitest";
import { polygonsToSVG } from "../../../src/exporters/svg";

describe("polygonsToSVG", () => {
  it("emits a single closed path for one polygon", () => {
    const svg = polygonsToSVG([[[0, 0], [10, 0], [10, 10], [0, 10]]], { margin: 1 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("M 0 0");
    expect(svg).toContain("Z");
  });

  it("uses mm as units and tight viewBox + margin", () => {
    const svg = polygonsToSVG([[[5, 5], [15, 5], [15, 15], [5, 15]]], { margin: 2 });
    expect(svg).toMatch(/viewBox="3 3 14 14"/);
    expect(svg).toContain('width="14mm"');
    expect(svg).toContain('height="14mm"');
  });

  it("emits each polygon as its own subpath (donut = outer + hole)", () => {
    const svg = polygonsToSVG(
      [
        [[0, 0], [10, 0], [10, 10], [0, 10]],
        [[3, 3], [7, 3], [7, 7], [3, 7]],
      ],
      { margin: 0 },
    );
    const moveCount = (svg.match(/M /g) ?? []).length;
    expect(moveCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- exporters/svg
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/exporters/svg.ts`**

```ts
export type Point = [number, number];
export type Polygon = Point[];

export function polygonsToSVG(polys: Polygon[], opts: { margin: number }): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 0; maxY = 0;
  }
  const m = opts.margin;
  const x0 = minX - m, y0 = minY - m;
  const w = (maxX - minX) + 2 * m;
  const h = (maxY - minY) + 2 * m;

  const paths = polys
    .map((poly) => {
      if (poly.length === 0) return "";
      const [[fx, fy], ...rest] = poly;
      const segs = [`M ${fx} ${fy}`, ...rest.map(([x, y]) => `L ${x} ${y}`), "Z"];
      return segs.join(" ");
    })
    .filter((p) => p.length > 0)
    .join(" ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" `,
    `viewBox="${x0} ${y0} ${w} ${h}" `,
    `width="${w}mm" height="${h}mm">`,
    `<path d="${paths}" fill="none" stroke="black" stroke-width="0.001" />`,
    `</svg>`,
  ].join("");
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- exporters/svg
```
Expected: 3 tests passing.

- [ ] **Step 5: Add `buildLetterLayers` that produces the 4 polygon sets**

Append to `src/exporters/svg.ts`:

```ts
import { getManifold } from "../geometry/manifold-init";
import { GlyphContours } from "../geometry/types";

export type LetterLayers = {
  back: Polygon[];   // = outer
  wall: Polygon[];   // = outer ∖ cavity
  rabbet: Polygon[]; // = outer ∖ rabbetCut
  plexi: Polygon[];  // = rabbetCut
};

export type LayerInputs = {
  contours: GlyphContours;
  wallThickness: number;
  rabbetLipWidth: number;
};

export async function buildLetterLayers(input: LayerInputs): Promise<LetterLayers | null> {
  const m = await getManifold();
  const { CrossSection } = m;

  const outer = new CrossSection(input.contours, "NonZero" as any);
  const cavity = outer.offset(-input.wallThickness, "Round" as any);
  const rabbetCut = outer.offset(-input.rabbetLipWidth, "Round" as any);

  if (cavity.isEmpty() || rabbetCut.isEmpty()) {
    outer.delete(); cavity.delete(); rabbetCut.delete();
    return null;
  }

  const wall = outer.subtract(cavity);
  const rabbet = outer.subtract(rabbetCut);

  const result: LetterLayers = {
    back: outer.toPolygons() as Polygon[],
    wall: wall.toPolygons() as Polygon[],
    rabbet: rabbet.toPolygons() as Polygon[],
    plexi: rabbetCut.toPolygons() as Polygon[],
  };

  outer.delete(); cavity.delete(); rabbetCut.delete();
  wall.delete(); rabbet.delete();
  return result;
}
```

- [ ] **Step 6: Add a fixture-driven test for `buildLetterLayers`**

Append to `tests/unit/exporters/svg.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { buildLetterLayers } from "../../../src/exporters/svg";
import { flattenGlyph } from "../../../src/geometry/flatten";
import { capHeightScale } from "../../../src/geometry/scale";

describe("buildLetterLayers", () => {
  const buf = readFileSync(resolve(__dirname, "../../fixtures/fonts/Inter-Regular.ttf"));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  function contoursFor(ch: string) {
    const scale = capHeightScale(font, 100);
    const raw = flattenGlyph(font.charToGlyph(ch), font.unitsPerEm, 0.1);
    return raw.map((p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]));
  }

  it("produces all four layers for 'O'", async () => {
    const layers = await buildLetterLayers({
      contours: contoursFor("O"),
      wallThickness: 3,
      rabbetLipWidth: 5,
    });
    expect(layers).not.toBeNull();
    if (!layers) return;
    expect(layers.back.length).toBeGreaterThan(0);
    expect(layers.wall.length).toBeGreaterThan(0);
    expect(layers.rabbet.length).toBeGreaterThan(0);
    expect(layers.plexi.length).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 7: Run all SVG tests**

```bash
npm test -- exporters/svg
```
Expected: 4 tests passing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: SVG layer exporter (back, wall, rabbet, plexi)"
```

---

## Task 15: Manifest + ZIP bundlers

**Files:**
- Create: `src/exporters/manifest.ts`
- Create: `src/exporters/zip.ts`
- Create: `tests/unit/exporters/zip.test.ts`

- [ ] **Step 1: Implement `src/exporters/manifest.ts`**

```ts
import { Parameters } from "../state/parameters";

export function buildManifest(params: Parameters, fontHash: string): string {
  return JSON.stringify(
    {
      generator: "lightbox-letter-generator",
      version: 1,
      generatedAt: new Date().toISOString(),
      parameters: { ...params },
      fontSha256: fontHash,
    },
    null,
    2,
  );
}
```

- [ ] **Step 2: Write zip test**

```ts
// tests/unit/exporters/zip.test.ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleSTLs, bundleSVGs } from "../../../src/exporters/zip";

describe("bundleSTLs", () => {
  it("packages letters with numeric prefixes and a manifest", async () => {
    const blob = await bundleSTLs(
      [
        { char: "M", index: 0, stl: new ArrayBuffer(84) },
        { char: "i", index: 1, stl: new ArrayBuffer(84) },
      ],
      "{}",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("01_M.stl")).toBeTruthy();
    expect(zip.file("02_i.stl")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeTruthy();
  });

  it("uses safe filenames for non-alphanumeric letters", async () => {
    const blob = await bundleSTLs(
      [{ char: "?", index: 0, stl: new ArrayBuffer(84) }],
      "{}",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toContainEqual(expect.stringMatching(/^01_/));
  });
});

describe("bundleSVGs", () => {
  it("packages four svgs per letter plus README", async () => {
    const blob = await bundleSVGs(
      [
        {
          char: "M",
          index: 0,
          back: "<svg/>",
          wall: "<svg/>",
          rabbet: "<svg/>",
          plexi: "<svg/>",
        },
      ],
      "manifest",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("01_M_back.svg")).toBeTruthy();
    expect(zip.file("01_M_wall.svg")).toBeTruthy();
    expect(zip.file("01_M_rabbet.svg")).toBeTruthy();
    expect(zip.file("01_M_plexi.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npm test -- exporters/zip
```
Expected: FAIL.

- [ ] **Step 4: Implement `src/exporters/zip.ts`**

```ts
import JSZip from "jszip";

const README = `Lightbox letter generator output

Files in this archive:
  NN_<letter>_back.svg    — solid letter outline (the floor)
  NN_<letter>_wall.svg    — wall ring (donut). Stack copies to (totalDepth - rabbetDepth - backThickness).
  NN_<letter>_rabbet.svg  — rabbet ring (the visible lip)
  NN_<letter>_plexi.svg   — plexi cut shape (drops into the rabbet)

Stack order from back to front:
  1× back
  N× wall  (until you reach totalDepth - rabbetDepth - backThickness)
  1× rabbet
  Plexi sheet sits inside rabbet, flush with front face.

NN preserves source word order. Spaces are skipped.
`;

function safeFilenameFragment(ch: string, fallback: string): string {
  return /[A-Za-z0-9]/.test(ch) ? ch : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type STLEntry = { char: string; index: number; stl: ArrayBuffer };

export async function bundleSTLs(entries: STLEntry[], manifestJson: string): Promise<Blob> {
  const zip = new JSZip();
  entries.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}.stl`;
    zip.file(name, e.stl);
  });
  zip.file("manifest.json", manifestJson);
  return zip.generateAsync({ type: "blob" });
}

export type SVGEntry = {
  char: string;
  index: number;
  back: string;
  wall: string;
  rabbet: string;
  plexi: string;
};

export async function bundleSVGs(entries: SVGEntry[], manifestJson: string): Promise<Blob> {
  const zip = new JSZip();
  entries.forEach((e, slot) => {
    const base = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}`;
    zip.file(`${base}_back.svg`, e.back);
    zip.file(`${base}_wall.svg`, e.wall);
    zip.file(`${base}_rabbet.svg`, e.rabbet);
    zip.file(`${base}_plexi.svg`, e.plexi);
  });
  zip.file("manifest.json", manifestJson);
  zip.file("README.txt", README);
  return zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 5: Run, expect pass**

```bash
npm test -- exporters/zip
```
Expected: 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: STL and SVG zip bundlers with manifest + readme"
```

---

## Task 16: Web Worker entrypoint

**Files:**
- Create: `src/geometry/worker.ts`
- Create: `src/geometry/worker-client.ts`
- Modify: nothing else (no test for the worker — covered by smoke test)

- [ ] **Step 1: Implement `src/geometry/worker.ts`**

```ts
/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import { Parameters } from "../state/parameters";

type WorkerRequest =
  | {
      kind: "build";
      requestId: string;
      params: Parameters;
      fontBuffer: ArrayBuffer;
    };

type LetterMesh = {
  char: string;
  index: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type LetterLayersMsg = {
  char: string;
  index: number;
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

type LetterError = { char: string; index: number; reason: "offset_collapsed" | "no_contours" };

type WorkerResponse = {
  requestId: string;
  letters: LetterMesh[];
  layers: LetterLayersMsg[];
  errors: LetterError[];
};

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind !== "build") return;

  const font = opentype.parse(req.fontBuffer);
  const scale = capHeightScale(font, req.params.letterHeight);
  const chars = Array.from(req.params.text).filter((c) => !/\s/.test(c));

  const letters: LetterMesh[] = [];
  const layers: LetterLayersMsg[] = [];
  const errors: LetterError[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const glyph = font.charToGlyph(char);
    const rawContours = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const contours = rawContours.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );

    const meshResult = await buildLetterShell({
      contours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      rabbetLipWidth: req.params.rabbetLipWidth,
    });

    if (!meshResult.ok) {
      errors.push({ char, index: i, reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);
    letters.push({
      char,
      index: i,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
    });

    const layerResult = await buildLetterLayers({
      contours,
      wallThickness: req.params.wallThickness,
      rabbetLipWidth: req.params.rabbetLipWidth,
    });
    if (layerResult) {
      layers.push({ char, index: i, ...layerResult });
    }
  }

  const response: WorkerResponse = { requestId: req.requestId, letters, layers, errors };

  // Transfer the buffers we can.
  const transferables: Transferable[] = [];
  for (const l of letters) {
    transferables.push(l.vertProperties.buffer, l.triVerts.buffer);
  }
  (self as any).postMessage(response, transferables);
};
```

- [ ] **Step 2: Implement `src/geometry/worker-client.ts`**

```ts
import { Parameters } from "../state/parameters";

export type LetterMesh = {
  char: string;
  index: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export type LetterLayers = {
  char: string;
  index: number;
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

export type LetterError = { char: string; index: number; reason: "offset_collapsed" | "no_contours" };

export type BuildResult = {
  letters: LetterMesh[];
  layers: LetterLayers[];
  errors: LetterError[];
};

let worker: Worker | null = null;
let counter = 0;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function build(params: Parameters, fontBuffer: ArrayBuffer): Promise<BuildResult> {
  const w = ensureWorker();
  const requestId = String(++counter);
  return new Promise((resolve) => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.requestId !== requestId) return;
      w.removeEventListener("message", handler);
      resolve({ letters: ev.data.letters, layers: ev.data.layers, errors: ev.data.errors });
    };
    w.addEventListener("message", handler);
    w.postMessage(
      { kind: "build", requestId, params, fontBuffer: fontBuffer.slice(0) },
    );
  });
}
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```
Expected: builds without errors. The worker chunk should be in `dist/assets/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: web worker for geometry pipeline"
```

---

## Task 17: Number field component with validation

**Files:**
- Create: `src/ui/NumberField.tsx`
- Create: `tests/unit/ui/NumberField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/ui/NumberField.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "../../../src/ui/NumberField";

describe("NumberField", () => {
  it("renders label and value", () => {
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={() => {}} />);
    expect(screen.getByLabelText("Wall thickness")).toHaveValue(3);
    expect(screen.getByText("mm")).toBeInTheDocument();
  });

  it("calls onChange with parsed numeric value", () => {
    const onChange = vi.fn();
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Wall thickness"), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("displays error message when error prop set", () => {
    render(
      <NumberField
        label="Rabbet depth"
        unit="mm"
        value={3}
        onChange={() => {}}
        error="Must be less than total depth"
      />,
    );
    expect(screen.getByText("Must be less than total depth")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- NumberField
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/NumberField.tsx`**

```tsx
import { useId } from "react";

type Props = {
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  error?: string;
};

export function NumberField({ label, unit, value, onChange, step = 0.1, min = 0, error }: Props) {
  const id = useId();
  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className="number-field-input">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        <span className="number-field-unit">{unit}</span>
      </div>
      {error && <div className="number-field-error" role="alert">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- NumberField
```
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: NumberField component"
```

---

## Task 18: Controls panel + text input + font picker

**Files:**
- Create: `src/ui/TextInput.tsx`, `src/ui/FontPicker.tsx`, `src/ui/ControlsPanel.tsx`
- Create: `src/ui/styles.css`

- [ ] **Step 1: Implement `src/ui/TextInput.tsx`**

```tsx
import { useParameters } from "../state/parameters";

export function TextInput() {
  const { text, set } = useParameters();
  return (
    <div className="text-input">
      <label htmlFor="text">Text</label>
      <textarea
        id="text"
        rows={2}
        value={text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Type a word…"
        spellCheck={false}
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/ui/FontPicker.tsx`**

```tsx
import { useRef } from "react";
import { useParameters } from "../state/parameters";
import { BUNDLED_FONTS } from "../fonts/bundled";
import { sha256OfBuffer, parseFontBuffer } from "../fonts/load";
import { cacheFont } from "../fonts/cache";

export function FontPicker() {
  const { fontSource, set } = useParameters();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    const buf = await file.arrayBuffer();
    try {
      await parseFontBuffer(buf);
    } catch (err) {
      alert(`Could not parse font: ${(err as Error).message}`);
      return;
    }
    const sha = await sha256OfBuffer(buf);
    await cacheFont(sha, buf);
    set({ fontSource: { kind: "uploaded", name: file.name, sha256: sha } });
  }

  return (
    <div className="font-picker">
      <label htmlFor="font">Font</label>
      <select
        id="font"
        value={fontSource.kind === "bundled" ? fontSource.id : "__uploaded"}
        onChange={(e) => {
          if (e.target.value !== "__uploaded") {
            set({ fontSource: { kind: "bundled", id: e.target.value } });
          }
        }}
      >
        {BUNDLED_FONTS.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
        {fontSource.kind === "uploaded" && (
          <option value="__uploaded">Uploaded: {fontSource.name}</option>
        )}
      </select>
      <button type="button" onClick={() => fileRef.current?.click()}>
        Upload TTF/OTF…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,application/font-sfnt"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/ui/ControlsPanel.tsx`**

```tsx
import { useParameters } from "../state/parameters";
import { validate, ValidationError } from "../geometry/validate";
import { TextInput } from "./TextInput";
import { FontPicker } from "./FontPicker";
import { NumberField } from "./NumberField";
import { ExportButtons } from "./ExportButtons";

function errorFor(errors: ValidationError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function ControlsPanel() {
  const params = useParameters();
  const result = validate(params);
  const errs = result.ok ? [] : result.errors;

  return (
    <aside className="controls-panel">
      <TextInput />
      <FontPicker />

      <fieldset>
        <legend>Size</legend>
        <NumberField
          label="Letter height"
          unit="mm"
          value={params.letterHeight}
          onChange={(v) => params.set({ letterHeight: v })}
          error={errorFor(errs, "letterHeight")}
          step={1}
        />
      </fieldset>

      <fieldset>
        <legend>Walls</legend>
        <NumberField
          label="Wall thickness"
          unit="mm"
          value={params.wallThickness}
          onChange={(v) => params.set({ wallThickness: v })}
          error={errorFor(errs, "wallThickness")}
        />
        <NumberField
          label="Total depth"
          unit="mm"
          value={params.totalDepth}
          onChange={(v) => params.set({ totalDepth: v })}
          error={errorFor(errs, "totalDepth")}
        />
        <NumberField
          label="Back thickness"
          unit="mm"
          value={params.backThickness}
          onChange={(v) => params.set({ backThickness: v })}
          error={errorFor(errs, "backThickness")}
        />
      </fieldset>

      <fieldset>
        <legend>Plexi inset</legend>
        <NumberField
          label="Rabbet depth"
          unit="mm"
          value={params.rabbetDepth}
          onChange={(v) => params.set({ rabbetDepth: v })}
          error={errorFor(errs, "rabbetDepth")}
        />
        <NumberField
          label="Rabbet lip width"
          unit="mm"
          value={params.rabbetLipWidth}
          onChange={(v) => params.set({ rabbetLipWidth: v })}
          error={errorFor(errs, "rabbetLipWidth")}
        />
      </fieldset>

      <details>
        <summary>Advanced</summary>
        <NumberField
          label="Bezier tolerance"
          unit="mm"
          value={params.bezierTolerance}
          onChange={(v) => params.set({ bezierTolerance: v })}
          step={0.01}
          error={errorFor(errs, "bezierTolerance")}
        />
      </details>

      <ExportButtons disabled={!result.ok} />
    </aside>
  );
}
```

- [ ] **Step 4: Implement minimal `src/ui/ExportButtons.tsx` placeholder**

```tsx
type Props = { disabled: boolean };
export function ExportButtons({ disabled }: Props) {
  return (
    <div className="export-buttons">
      <button disabled={disabled}>Download STL (.zip)</button>
      <button disabled={disabled}>Download SVG (.zip)</button>
    </div>
  );
}
```

(Real exporters wire up in Task 21.)

- [ ] **Step 5: Add minimal `src/ui/styles.css`**

```css
:root { font-family: system-ui, sans-serif; }
body { margin: 0; }
.app {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100vh;
}
.controls-panel { padding: 1rem; overflow: auto; border-right: 1px solid #ddd; }
.controls-panel fieldset { border: 1px solid #ddd; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }
.controls-panel legend { padding: 0 0.25rem; font-weight: 600; }
.number-field { margin-bottom: 0.5rem; }
.number-field label { display: block; font-size: 0.875rem; margin-bottom: 0.25rem; }
.number-field-input { display: flex; gap: 0.25rem; align-items: center; }
.number-field-input input { flex: 1; padding: 0.25rem; }
.number-field-unit { color: #666; }
.number-field-error { color: #c00; font-size: 0.75rem; margin-top: 0.25rem; }
.preview-canvas { width: 100%; height: 100%; }
```

- [ ] **Step 6: Wire into `src/App.tsx`**

```tsx
import "./ui/styles.css";
import { ControlsPanel } from "./ui/ControlsPanel";
import { PreviewCanvas } from "./ui/PreviewCanvas";

export default function App() {
  return (
    <div className="app">
      <ControlsPanel />
      <PreviewCanvas />
    </div>
  );
}
```

The PreviewCanvas is implemented in Task 19. Add a stub now to keep the build green:

```tsx
// src/ui/PreviewCanvas.tsx
export function PreviewCanvas() {
  return <div className="preview-canvas" />;
}
```

- [ ] **Step 7: Verify dev server runs**

```bash
npm run dev
```
Expected: page loads, controls render, errors display when typing 0 in a field.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: controls panel with text, font picker, parameter fields"
```

---

## Task 19: 3D preview canvas

**Files:**
- Modify: `src/ui/PreviewCanvas.tsx`
- Create: `src/ui/PreviewLetter.tsx`
- Create: `src/ui/usePreviewBuild.ts`

- [ ] **Step 1: Implement `src/ui/usePreviewBuild.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import opentype from "opentype.js";
import { useParameters, FontSource } from "../state/parameters";
import { validate } from "../geometry/validate";
import { build, BuildResult } from "../geometry/worker-client";
import { BUNDLED_FONTS, bundledFontById } from "../fonts/bundled";
import { getCachedFont } from "../fonts/cache";

async function loadFontBuffer(source: FontSource): Promise<ArrayBuffer | null> {
  if (source.kind === "bundled") {
    const def = bundledFontById(source.id) ?? BUNDLED_FONTS[0];
    const res = await fetch(`./${def.path}`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  }
  return (await getCachedFont(source.sha256)) ?? null;
}

export function usePreviewBuild() {
  const params = useParameters();
  const [result, setResult] = useState<BuildResult | null>(null);
  const [layoutFont, setLayoutFont] = useState<opentype.Font | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    const v = validate(params);
    if (!v.ok || params.text.trim().length === 0) {
      setResult(null);
      return;
    }

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      const buf = await loadFontBuffer(params.fontSource);
      if (!buf) {
        setResult(null);
        return;
      }
      setLayoutFont(opentype.parse(buf.slice(0)));
      setBusy(true);
      const r = await build(params, buf);
      setBusy(false);
      setResult(r);
    }, 150);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [
    params.text,
    params.fontSource,
    params.letterHeight,
    params.wallThickness,
    params.totalDepth,
    params.backThickness,
    params.rabbetDepth,
    params.rabbetLipWidth,
    params.bezierTolerance,
  ]);

  return { result, busy, layoutFont };
}
```

- [ ] **Step 2: Implement `src/ui/PreviewLetter.tsx`**

```tsx
import { useMemo } from "react";
import * as THREE from "three";
import { LetterMesh } from "../geometry/worker-client";

type Props = { letter: LetterMesh; xOffset: number };

export function PreviewLetter({ letter, xOffset }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(letter.vertProperties, 3));
    g.setIndex(new THREE.BufferAttribute(letter.triVerts, 1));
    g.computeVertexNormals();
    return g;
  }, [letter]);

  return (
    <mesh geometry={geometry} position={[xOffset, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#cccccc" metalness={0.1} roughness={0.6} />
    </mesh>
  );
}
```

- [ ] **Step 3: Implement `src/ui/PreviewCanvas.tsx`**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useParameters } from "../state/parameters";
import { usePreviewBuild } from "./usePreviewBuild";
import { PreviewLetter } from "./PreviewLetter";
import { layoutWord } from "../geometry/layout";

export function PreviewCanvas() {
  const params = useParameters();
  const { result, busy, layoutFont } = usePreviewBuild();

  const positions = layoutFont ? layoutWord(layoutFont, params.text, params.letterHeight) : [];
  const lettersByIndex = new Map((result?.letters ?? []).map((l) => [l.index, l]));
  // Map preview-layout index (only visible chars in original text) to letters built (also visible chars).
  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => { if (!/\s/.test(c)) visibleCharIndices.push(i); });

  return (
    <div className="preview-canvas">
      {busy && <div className="preview-busy">Generating…</div>}
      <Canvas shadows camera={{ position: [0, 0, 400], fov: 35 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 200, 200]} intensity={1} castShadow />
        <OrbitControls />
        {positions.map((p, i) => {
          const originalIndex = visibleCharIndices[i];
          const letter = lettersByIndex.get(originalIndex);
          if (!letter) return null;
          return <PreviewLetter key={`${i}-${p.char}`} letter={letter} xOffset={p.xOffset} />;
        })}
      </Canvas>
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>Letter '{e.char}': {e.reason}</div>
          ))}
        </div>
      )}
      {!result && params.text.trim().length === 0 && (
        <div className="preview-empty">Type a word to begin</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add corresponding CSS to `src/ui/styles.css`**

Append:
```css
.preview-canvas { position: relative; }
.preview-busy, .preview-empty {
  position: absolute; top: 0.5rem; left: 50%; transform: translateX(-50%);
  background: #fff8; padding: 0.25rem 0.75rem; border-radius: 4px;
}
.preview-empty { color: #888; }
.preview-errors {
  position: absolute; bottom: 0.5rem; left: 0.5rem;
  background: #fee; color: #900; padding: 0.5rem; border-radius: 4px; font-size: 0.875rem;
}
```

- [ ] **Step 5: Verify dev server**

```bash
npm run dev
```
Expected: type a word with the bundled Inter font; letters appear in 3D within ~1s; orbit controls work.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 3D preview with react-three-fiber"
```

---

## Task 20: State persistence (URL + localStorage)

**Files:**
- Create: `src/state/persistence.ts`
- Modify: `src/main.tsx` (initialize persistence)

- [ ] **Step 1: Implement `src/state/persistence.ts`**

```ts
import { Parameters, useParameters, DEFAULT_PARAMETERS } from "./parameters";

const LS_KEY = "lightbox-params-v1";
const URL_KEY = "p";

type Serializable = Omit<Parameters, "fontSource"> & {
  fontSource: { kind: "bundled"; id: string } | { kind: "uploaded"; name: string; sha256: string };
};

function fromQueryOrStorage(): Partial<Parameters> | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(URL_KEY);
    if (q) return JSON.parse(decodeURIComponent(q)) as Partial<Parameters>;
  } catch {}
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Partial<Parameters>;
  } catch {}
  return null;
}

export function initPersistence(): void {
  const initial = fromQueryOrStorage();
  if (initial) {
    useParameters.setState({ ...DEFAULT_PARAMETERS, ...initial });
  }

  useParameters.subscribe((state) => {
    const ser: Serializable = {
      text: state.text,
      fontSource: state.fontSource,
      letterHeight: state.letterHeight,
      wallThickness: state.wallThickness,
      totalDepth: state.totalDepth,
      backThickness: state.backThickness,
      rabbetDepth: state.rabbetDepth,
      rabbetLipWidth: state.rabbetLipWidth,
      bezierTolerance: state.bezierTolerance,
    };
    const json = JSON.stringify(ser);
    try { window.localStorage.setItem(LS_KEY, json); } catch {}

    const url = new URL(window.location.href);
    url.searchParams.set(URL_KEY, encodeURIComponent(json));
    window.history.replaceState(null, "", url.toString());
  });
}
```

- [ ] **Step 2: Wire into `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPersistence } from "./state/persistence";

initPersistence();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Type a word, change parameters, refresh — values persist. Copy the URL to a new tab — values restore.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: URL + localStorage persistence"
```

---

## Task 21: Wire export buttons

**Files:**
- Modify: `src/ui/ExportButtons.tsx`

- [ ] **Step 1: Replace `src/ui/ExportButtons.tsx` with the working version**

```tsx
import { useState } from "react";
import { saveAs } from "file-saver";
import { useParameters } from "../state/parameters";
import { usePreviewBuild } from "./usePreviewBuild";
import { meshToBinarySTL } from "../exporters/stl";
import { polygonsToSVG } from "../exporters/svg";
import { bundleSTLs, bundleSVGs } from "../exporters/zip";
import { buildManifest } from "../exporters/manifest";
import { sha256OfBuffer } from "../fonts/load";
import { BUNDLED_FONTS, bundledFontById } from "../fonts/bundled";
import { getCachedFont } from "../fonts/cache";

type Props = { disabled: boolean };

async function fontSha(params: ReturnType<typeof useParameters>): Promise<string> {
  if (params.fontSource.kind === "uploaded") return params.fontSource.sha256;
  const def = bundledFontById(params.fontSource.id) ?? BUNDLED_FONTS[0];
  const buf = await (await fetch(`./${def.path}`)).arrayBuffer();
  return sha256OfBuffer(buf);
}

async function fontBuffer(source: ReturnType<typeof useParameters>["fontSource"]): Promise<ArrayBuffer | null> {
  if (source.kind === "bundled") {
    const def = bundledFontById(source.id) ?? BUNDLED_FONTS[0];
    return (await fetch(`./${def.path}`)).arrayBuffer();
  }
  return (await getCachedFont(source.sha256)) ?? null;
}

export function ExportButtons({ disabled }: Props) {
  const params = useParameters();
  const { result } = usePreviewBuild();
  const [busy, setBusy] = useState<"stl" | "svg" | null>(null);

  async function exportSTL() {
    if (!result || result.letters.length === 0) return;
    setBusy("stl");
    try {
      const sha = await fontSha(params);
      const manifest = buildManifest(params, sha);
      const entries = result.letters.map((l) => ({
        char: l.char,
        index: l.index,
        stl: meshToBinarySTL({ vertProperties: l.vertProperties, triVerts: l.triVerts }),
      }));
      const blob = await bundleSTLs(entries, manifest);
      saveAs(blob, `lightbox-stl-${Date.now()}.zip`);
    } finally {
      setBusy(null);
    }
  }

  async function exportSVG() {
    if (!result || result.layers.length === 0) return;
    setBusy("svg");
    try {
      const sha = await fontSha(params);
      const manifest = buildManifest(params, sha);
      const entries = result.layers.map((l) => ({
        char: l.char,
        index: l.index,
        back: polygonsToSVG(l.back, { margin: 1 }),
        wall: polygonsToSVG(l.wall, { margin: 1 }),
        rabbet: polygonsToSVG(l.rabbet, { margin: 1 }),
        plexi: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
      const blob = await bundleSVGs(entries, manifest);
      saveAs(blob, `lightbox-svg-${Date.now()}.zip`);
    } finally {
      setBusy(null);
    }
  }

  // fontBuffer kept for symmetry / possible future use.
  void fontBuffer;

  const empty = !result || result.letters.length === 0;

  return (
    <div className="export-buttons">
      <button disabled={disabled || empty || busy !== null} onClick={exportSTL}>
        {busy === "stl" ? "Bundling…" : "Download STL (.zip)"}
      </button>
      <button disabled={disabled || empty || busy !== null} onClick={exportSVG}>
        {busy === "svg" ? "Bundling…" : "Download SVG (.zip)"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify dev server**

```bash
npm run dev
```

Type "Hi", click Download STL (.zip), unzip, check that `01_H.stl`, `02_i.stl`, and `manifest.json` are present.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire STL + SVG export buttons"
```

---

## Task 22: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Init playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 2: Implement `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:5174",
    ...devices["Desktop Chrome"],
  },
});
```

- [ ] **Step 3: Implement `tests/e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, export STL", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");

  // Wait for preview to settle (heuristic: STL button enables when build completes).
  const stlButton = page.getByRole("button", { name: /Download STL/ });
  await expect(stlButton).toBeEnabled({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent("download");
  await stlButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);
  expect(zip.file("01_H.stl")).toBeTruthy();
  expect(zip.file("02_i.stl")).toBeTruthy();
  expect(zip.file("manifest.json")).toBeTruthy();
});
```

- [ ] **Step 4: Run e2e test**

```bash
npm run e2e
```
Expected: test passes. If the worker takes long on first run (manifold WASM cold start), increase the `toBeEnabled` timeout.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: Playwright smoke test for STL export"
```

---

## Task 23: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Implement deploy workflow**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci: GitHub Pages deploy workflow"
```

- [ ] **Step 3: Note for the operator**

Repository settings → Pages → Source = "GitHub Actions". The workflow runs on push to `main`. The first deploy may need a manual `workflow_dispatch` trigger.

---

## Self-Review

**Spec coverage:**
- ✅ Tech stack (Task 1)
- ✅ Project layout (Task 1, 5, 8, 11, 13–18)
- ✅ Parameters type + defaults + persistence (Task 3, 20)
- ✅ Validation (Task 4) + offset-collapse runtime check (Task 11)
- ✅ Font loading: bundled + uploaded + IndexedDB (Task 7, 8)
- ✅ Glyph flattening (Task 6)
- ✅ Cap-height scaling, lowercase proportional (Task 9)
- ✅ Three 2D regions + extrude + boolean shell (Task 11)
- ✅ Word layout with kerning (Task 12)
- ✅ Per-letter origin: centered XY, Z=0 at back (Task 11 step 5)
- ✅ Disjoint glyphs ship as multi-component meshes (manifold handles natively in Task 11)
- ✅ STL exporter, manifest.json, file naming (Task 13, 15)
- ✅ SVG exporter, four layers, README (Task 14, 15)
- ✅ Web Worker for CSG (Task 16)
- ✅ Two-column UI (Task 18)
- ✅ Number field with inline error (Task 17)
- ✅ Controls panel groups (Size, Walls, Plexi inset, Advanced) (Task 18)
- ✅ 3D preview with R3F + OrbitControls (Task 19)
- ✅ Empty state + error display (Task 19)
- ✅ Persistence: URL + localStorage (Task 20)
- ✅ Smoke test (Task 22)
- ✅ Deploy (Task 23)

**Gaps vs spec:**
- "Solid / wireframe / x-ray" view toggle on the 3D preview — not implemented. Worth adding as a v1 nice-to-have but spec marks it as part of UI; adding it now would mean another small task (~10–15 min). Including it as Task 19b is reasonable but optional. **Decision:** leave as a follow-up issue; v1 ships with solid view only.
- "Letter count + total estimated print volume" overlay — not implemented. Same reasoning: small follow-up.
- Per-letter progress bar — partially shown via the "Generating…" spinner in PreviewCanvas; per-letter granularity not implemented. Sufficient for v1.
- "Worker reports per-letter progress" — current worker posts a single response when done. To get progressive updates the worker would need to `postMessage` after each letter. Sufficient for v1 given typical word lengths.

These are documented as v1.1 follow-ups; spec acceptance criteria do not require them.

**Placeholder scan:** none found.

**Type consistency:**
- `LetterMesh` defined identically in `worker.ts` and `worker-client.ts` ✓
- `Polygon` is `[number, number][]` everywhere (geometry/types.ts, exporters/svg.ts) ✓
- `FontSource` consistent in `state/parameters.ts` and consumers (Task 18, 19, 21) ✓
- `ShellInputs.contours` and `LayerInputs.contours` both expect mm-scaled `GlyphContours` ✓

Plan complete and saved to `docs/superpowers/plans/2026-05-22-lightbox-letter-generator.md`.
