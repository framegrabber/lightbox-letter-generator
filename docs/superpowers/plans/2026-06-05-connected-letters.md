# Connected Letters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a connected-letter mode that merges adjacent letters into one shell so a continuous LED strip can be routed through. Connection is achieved by negative letter-spacing (overlap) and/or an explicit horizontal bridge bar; both default to off.

**Architecture:** Insert a 2D pre-merge stage (`src/geometry/merge.ts`) between layout and shell that translates glyphs to word space, optionally adds bridge rectangles, runs union-find by `CrossSection.intersect`, and unions each connected group into one merged contour set. The worker emits `ComponentMesh[]` (one per connected component) instead of `LetterMesh[]`. Today's defaults produce one component per letter, preserving the existing user experience.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Vite, React 19, manifold-3d (WASM via Web Worker), zustand, Vitest, Playwright.

**Spec reference:** `docs/superpowers/specs/2026-06-05-connected-letters-design.md`

---

## File Structure

**Created:**
- `src/geometry/merge.ts` — pre-merge stage: translate glyphs to word space, build bridges, union-find connectivity, materialize `Component[]`.
- `tests/unit/geometry/merge.test.ts` — unit tests for the merge stage.
- `tests/unit/state/persistence.test.ts` — `migrate()` fills new fields with defaults and preserves the legacy `rabbetLipWidth → insetWidth` translation.

**Modified:**
- `src/state/parameters.ts` — four new fields with defaults.
- `src/state/persistence.ts` — `migrate()` and serialize add new fields.
- `src/geometry/validate.ts` — bounds for new fields.
- `src/geometry/layout.ts` — `letterOverlap` argument (optional, default 0).
- `src/geometry/worker-client.ts` — rename `Letter*` to `Component*`; new fields (`members`, `xOffset`, `warnings`).
- `src/geometry/worker.ts` — restructured outer loop: build contour map, run merge stage, shell each component.
- `src/exporters/zip.ts` — `STLEntry`/`PlexiEntry` carry `chars` (joined member chars); filenames use `chars` with sanitization fallback.
- `src/exporters/manifest.ts` — new `Pieces` section listing each component; new params printed.
- `src/ui/PreviewCanvas.tsx` — iterate `components`, look up by component index.
- `src/ui/PreviewLetter.tsx` — accepts `ComponentMesh` and renders one merged mesh; the file keeps its name to minimize churn.
- `src/ui/ExportButtons.tsx` — read `result.components`; build `STLEntry`/`PlexiEntry` with joined member chars.
- `src/ui/usePreviewBuild.ts` — depend on new param fields so build re-fires when they change.
- `src/ui/ControlsPanel.tsx` — new "Connectors" fieldset with four `NumberField`s.
- `tests/unit/geometry/layout.test.ts` — overlap reduces cursor advance.
- `tests/unit/geometry/validate.test.ts` — bounds for new fields.
- `tests/unit/state/parameters.test.ts` — defaults for new fields.
- `tests/unit/exporters/zip.test.ts` — `chars` filename scheme + fallback for empty/non-ASCII.
- `tests/e2e/smoke.spec.ts` — set `letterOverlap` so two letters merge; assert one STL with joined name.

**Note on a spec/plan delta:** the spec's `MergeParams` lists `wallThickness`, but the bridge connectivity check uses `CrossSection.intersect` non-empty with no width threshold, so `wallThickness` is not used by the algorithm. We drop it from `MergeParams` in this plan. The bridge X-extent is centered between the letters with total length `bridgeWidth`, exactly as the spec defines. No change to user-visible behavior or to the spec's correctness statement.

---

## Task 1: Connected-letters parameters (state, persistence, validation)

**Files:**
- Modify: `src/state/parameters.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/geometry/validate.ts`
- Modify: `tests/unit/state/parameters.test.ts`
- Create: `tests/unit/state/persistence.test.ts`
- Modify: `tests/unit/geometry/validate.test.ts`

- [ ] **Step 1: Write failing parameters-store test**

Replace the existing test in `tests/unit/state/parameters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("parameters store", () => {
  beforeEach(() => {
    useParameters.setState(DEFAULT_PARAMETERS);
  });

  it("starts with defaults", () => {
    const state = useParameters.getState();
    expect(state.text).toBe("BURGER");
    expect(state.fontSource).toEqual({ kind: "bundled", id: "anton" });
    expect(state.letterHeight).toBe(200);
    expect(state.wallThickness).toBe(10);
    expect(state.totalDepth).toBe(100);
    expect(state.backThickness).toBe(2);
    expect(state.rabbetDepth).toBe(5);
    expect(state.insetWidth).toBe(5);
    expect(state.bezierTolerance).toBe(0.1);
    expect(state.letterOverlap).toBe(0);
    expect(state.bridgeWidth).toBe(0);
    expect(state.bridgeHeight).toBe(0);
    expect(state.bridgeY).toBe(-100); // -letterHeight / 2
  });

  it("updates a single field via set", () => {
    useParameters.getState().set({ text: "MAKING" });
    expect(useParameters.getState().text).toBe("MAKING");
  });

  it("updates connected-letters fields via set", () => {
    useParameters.getState().set({ letterOverlap: 5, bridgeWidth: 10 });
    expect(useParameters.getState().letterOverlap).toBe(5);
    expect(useParameters.getState().bridgeWidth).toBe(10);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: FAIL — `state.letterOverlap` is `undefined`.

- [ ] **Step 3: Add the four new parameters with defaults**

Replace `src/state/parameters.ts`:

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
  insetWidth: number;
  bezierTolerance: number;
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
};

const DEFAULT_LETTER_HEIGHT = 200;

export const DEFAULT_PARAMETERS: Parameters = {
  text: "BURGER",
  fontSource: { kind: "bundled", id: "anton" },
  letterHeight: DEFAULT_LETTER_HEIGHT,
  wallThickness: 10,
  totalDepth: 100,
  backThickness: 2,
  rabbetDepth: 5,
  insetWidth: 5,
  bezierTolerance: 0.1,
  letterOverlap: 0,
  bridgeWidth: 0,
  bridgeHeight: 0,
  bridgeY: -DEFAULT_LETTER_HEIGHT / 2,
};

type Store = Parameters & { set: (p: Partial<Parameters>) => void };

export const useParameters = create<Store>((set) => ({
  ...DEFAULT_PARAMETERS,
  set: (p) => set(p),
}));
```

- [ ] **Step 4: Run parameters test, verify pass**

Run: `npx vitest run tests/unit/state/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing persistence test**

Create `tests/unit/state/persistence.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// Re-export migrate via a test-only import path is unnecessary; we test through
// the same JSON shape persistence.ts uses internally. Import the migrate
// function directly by adding it to the module's exports (Step 7).

import { migrate } from "../../../src/state/persistence";

describe("persistence migrate", () => {
  it("fills new connected-letters fields with defaults when missing", () => {
    const out = migrate({
      text: "HI",
      letterHeight: 80,
      wallThickness: 3,
      totalDepth: 50,
      backThickness: 2,
      rabbetDepth: 5,
      insetWidth: 1.5,
      bezierTolerance: 0.1,
      fontSource: { kind: "bundled", id: "anton" },
    });
    expect(out.letterOverlap).toBe(0);
    expect(out.bridgeWidth).toBe(0);
    expect(out.bridgeHeight).toBe(0);
    expect(out.bridgeY).toBe(-40); // -letterHeight / 2
  });

  it("preserves existing connected-letters values", () => {
    const out = migrate({
      letterHeight: 200,
      letterOverlap: 7,
      bridgeWidth: 12,
      bridgeHeight: 4,
      bridgeY: -50,
    });
    expect(out.letterOverlap).toBe(7);
    expect(out.bridgeWidth).toBe(12);
    expect(out.bridgeHeight).toBe(4);
    expect(out.bridgeY).toBe(-50);
  });

  it("preserves the legacy rabbetLipWidth → insetWidth translation", () => {
    const out = migrate({ rabbetLipWidth: 3, wallThickness: 10 });
    expect(out.insetWidth).toBe(7);
    expect("rabbetLipWidth" in out).toBe(false);
  });

  it("falls back to bridgeY default when letterHeight is missing", () => {
    const out = migrate({});
    // No letterHeight, so we fall back to the default letterHeight.
    expect(out.bridgeY).toBe(-100);
  });
});
```

- [ ] **Step 6: Run persistence test, verify it fails**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: FAIL — `migrate` is not exported.

- [ ] **Step 7: Update persistence.ts to migrate and serialize new fields**

Replace `src/state/persistence.ts`:

```ts
import { useParameters, DEFAULT_PARAMETERS } from "./parameters";
import type { Parameters } from "./parameters";

const LS_KEY = "lightbox-params-v1";
const URL_KEY = "p";

type Serializable = Omit<Parameters, "fontSource"> & {
  fontSource: { kind: "bundled"; id: string } | { kind: "uploaded"; name: string; sha256: string };
};

// Translate any deprecated field names from older saves into current shape and
// fill in defaults for fields that didn't exist in older saves.
export function migrate(raw: Record<string, unknown>): Partial<Parameters> {
  const out: Record<string, unknown> = { ...raw };

  // Legacy rabbetLipWidth → insetWidth.
  if (typeof out.rabbetLipWidth === "number" && typeof out.wallThickness === "number") {
    out.insetWidth = out.wallThickness - out.rabbetLipWidth;
  }
  delete out.rabbetLipWidth;

  // Connected-letters fields added later: fill defaults if missing.
  if (typeof out.letterOverlap !== "number") {
    out.letterOverlap = DEFAULT_PARAMETERS.letterOverlap;
  }
  if (typeof out.bridgeWidth !== "number") {
    out.bridgeWidth = DEFAULT_PARAMETERS.bridgeWidth;
  }
  if (typeof out.bridgeHeight !== "number") {
    out.bridgeHeight = DEFAULT_PARAMETERS.bridgeHeight;
  }
  if (typeof out.bridgeY !== "number") {
    const lh = typeof out.letterHeight === "number" ? out.letterHeight : DEFAULT_PARAMETERS.letterHeight;
    out.bridgeY = -lh / 2;
  }

  return out as Partial<Parameters>;
}

function fromQueryOrStorage(): Partial<Parameters> | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(URL_KEY);
    if (q) return migrate(JSON.parse(q) as Record<string, unknown>);
  } catch {
    // ignore — fall through to localStorage
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    // ignore
  }
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
      insetWidth: state.insetWidth,
      bezierTolerance: state.bezierTolerance,
      letterOverlap: state.letterOverlap,
      bridgeWidth: state.bridgeWidth,
      bridgeHeight: state.bridgeHeight,
      bridgeY: state.bridgeY,
    };
    const json = JSON.stringify(ser);
    try {
      window.localStorage.setItem(LS_KEY, json);
    } catch {
      // quota or disabled
    }

    const url = new URL(window.location.href);
    url.searchParams.set(URL_KEY, json);
    window.history.replaceState(null, "", url.toString());
  });
}
```

- [ ] **Step 8: Run persistence test, verify pass**

Run: `npx vitest run tests/unit/state/persistence.test.ts`
Expected: PASS.

- [ ] **Step 9: Write failing validation test**

Append to `tests/unit/geometry/validate.test.ts`:

```ts
describe("connected-letters bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: -50,
  };

  it("accepts zero defaults", () => {
    const r = validate(base);
    expect(r.ok).toBe(true);
  });

  it("rejects negative letterOverlap", () => {
    const r = validate({ ...base, letterOverlap: -1 });
    expect(r.ok).toBe(false);
  });

  it("rejects letterOverlap >= letterHeight", () => {
    const r = validate({ ...base, letterOverlap: 100 });
    expect(r.ok).toBe(false);
  });

  it("rejects negative bridgeWidth or bridgeHeight", () => {
    expect(validate({ ...base, bridgeWidth: -1 }).ok).toBe(false);
    expect(validate({ ...base, bridgeHeight: -1 }).ok).toBe(false);
  });

  it("accepts negative bridgeY (above baseline in our flipped Y)", () => {
    const r = validate({ ...base, bridgeY: -200 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-finite bridgeY", () => {
    const r = validate({ ...base, bridgeY: NaN });
    expect(r.ok).toBe(false);
  });
});
```

(`describe`/`expect`/`validate` are already imported at the top of the file from earlier tests.)

- [ ] **Step 10: Run validate test, verify it fails**

Run: `npx vitest run tests/unit/geometry/validate.test.ts`
Expected: FAIL — fields not validated yet.

- [ ] **Step 11: Add validation rules**

Replace `src/geometry/validate.ts`:

```ts
import type { Parameters } from "../state/parameters";

export type ValidationError = { field: keyof Parameters | "_form"; letter?: string; message: string };

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export function validate(p: Parameters): ValidationResult {
  const errors: ValidationError[] = [];

  const positives = [
    "letterHeight", "wallThickness", "totalDepth",
    "backThickness", "rabbetDepth", "insetWidth", "bezierTolerance",
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

  if (Number.isFinite(p.insetWidth) && Number.isFinite(p.wallThickness)) {
    if (p.insetWidth >= p.wallThickness) {
      errors.push({
        field: "insetWidth",
        message: "Inset width must be less than wall thickness (the shelf is carved into the wall material)",
      });
    }
  }

  // Connected-letters bounds.
  if (!Number.isFinite(p.letterOverlap) || p.letterOverlap < 0) {
    errors.push({ field: "letterOverlap", message: "Letter overlap must be ≥ 0" });
  } else if (Number.isFinite(p.letterHeight) && p.letterOverlap >= p.letterHeight) {
    errors.push({ field: "letterOverlap", message: "Letter overlap must be less than letter height" });
  }
  if (!Number.isFinite(p.bridgeWidth) || p.bridgeWidth < 0) {
    errors.push({ field: "bridgeWidth", message: "Bridge width must be ≥ 0" });
  }
  if (!Number.isFinite(p.bridgeHeight) || p.bridgeHeight < 0) {
    errors.push({ field: "bridgeHeight", message: "Bridge height must be ≥ 0" });
  }
  if (!Number.isFinite(p.bridgeY)) {
    errors.push({ field: "bridgeY", message: "Bridge Y must be a finite number" });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 12: Run all tests, verify pass**

Run: `npx vitest run tests/unit/geometry/validate.test.ts tests/unit/state/`
Expected: PASS for all.

- [ ] **Step 13: Run lint and typecheck**

Run: `npm run lint`
Expected: clean.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add src/state/parameters.ts src/state/persistence.ts src/geometry/validate.ts \
  tests/unit/state/parameters.test.ts tests/unit/state/persistence.test.ts \
  tests/unit/geometry/validate.test.ts
git commit -m "feat: add connected-letters parameters with defaults

Adds letterOverlap, bridgeWidth, bridgeHeight, bridgeY to Parameters,
all defaulting to zero (or -letterHeight/2 for bridgeY). Persistence
migrate() fills missing fields. Validation rejects negatives and
overlap >= letterHeight. No behavior change yet — these params are
not consumed anywhere."
```

---

## Task 2: letterOverlap argument in layoutWord

**Files:**
- Modify: `src/geometry/layout.ts`
- Modify: `tests/unit/geometry/layout.test.ts`

- [ ] **Step 1: Write failing layout test**

Append to `tests/unit/geometry/layout.test.ts`:

```ts
describe("layoutWord with letterOverlap", () => {
  const font = loadFont();

  it("reduces cursor advance for non-space pairs", () => {
    const noOverlap = layoutWord(font, "AB", 100, 0);
    const withOverlap = layoutWord(font, "AB", 100, 5);
    expect(withOverlap[1].xOffset).toBeCloseTo(noOverlap[1].xOffset - 5, 5);
  });

  it("does not apply overlap across spaces", () => {
    const result = layoutWord(font, "A B", 100, 5);
    const noOverlap = layoutWord(font, "A B", 100, 0);
    // Both glyphs are A and B; the space between them must not be tightened.
    // The B in "A B" should land at the same xOffset as in the zero-overlap case.
    expect(result[1].xOffset).toBeCloseTo(noOverlap[1].xOffset, 5);
  });

  it("defaults to zero overlap when arg is omitted", () => {
    const a = layoutWord(font, "AB", 100);
    const b = layoutWord(font, "AB", 100, 0);
    expect(a[1].xOffset).toBe(b[1].xOffset);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/geometry/layout.test.ts`
Expected: FAIL — fourth arg is not accepted.

- [ ] **Step 3: Add letterOverlap argument to layoutWord**

Replace `src/geometry/layout.ts`:

```ts
import opentype from "opentype.js";
import { capHeightScale } from "./scale";

export type LayoutEntry = {
  char: string;
  glyph: opentype.Glyph;
  xOffset: number; // mm, position of glyph origin in word space
};

export function layoutWord(
  font: opentype.Font,
  text: string,
  letterHeight: number,
  letterOverlap = 0,
): LayoutEntry[] {
  const scale = capHeightScale(font, letterHeight);
  const glyphs = Array.from(text).map((ch) => ({ ch, glyph: font.charToGlyph(ch) }));

  const entries: LayoutEntry[] = [];
  let cursorFu = 0;

  // letterOverlap is in mm; convert to font units for the cursor arithmetic.
  const overlapFu = scale > 0 ? letterOverlap / scale : 0;

  for (let i = 0; i < glyphs.length; i++) {
    const { ch, glyph } = glyphs[i];
    const isSpace = /\s/.test(ch);

    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale });
    }

    cursorFu += glyph.advanceWidth ?? 0;

    if (i + 1 < glyphs.length) {
      const next = glyphs[i + 1];
      const kern = font.getKerningValue(glyph, next.glyph) ?? 0;
      cursorFu += kern;
      // Apply letter overlap only for non-space pairs (we don't tighten
      // around spaces).
      if (!isSpace && !/\s/.test(next.ch)) {
        cursorFu -= overlapFu;
      }
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run layout tests, verify pass**

Run: `npx vitest run tests/unit/geometry/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/layout.ts tests/unit/geometry/layout.test.ts
git commit -m "feat: layoutWord accepts letterOverlap

Subtracts overlap (in mm, converted to font units) from cursor
advance between consecutive non-space glyphs. Default 0 preserves
existing call sites."
```

---

## Task 3: Refactor worker contract — Letter → Component

This task introduces `ComponentMesh`/`ComponentLayers`/`ComponentError` as the worker's output unit and rewires every consumer. The worker continues to produce one component per letter (no merging yet); the merge stage lands in Task 5/6. After this task the build is fully green and the user-visible behavior is unchanged.

**Files:**
- Modify: `src/geometry/worker-client.ts`
- Modify: `src/geometry/worker.ts`
- Modify: `src/ui/PreviewLetter.tsx`
- Modify: `src/ui/PreviewCanvas.tsx`
- Modify: `src/ui/ExportButtons.tsx`
- Modify: `src/ui/usePreviewBuild.ts`
- Modify: `src/exporters/zip.ts`
- Modify: `tests/unit/exporters/zip.test.ts`

- [ ] **Step 1: Update worker-client types to Component shape**

Replace `src/geometry/worker-client.ts`:

```ts
import type { Parameters } from "../state/parameters";

export type ComponentMember = { char: string; index: number };

export type ComponentMesh = {
  members: ComponentMember[]; // left-to-right order
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  xOffset: number; // word-space minX before the per-component centering
  plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null;
};

export type ComponentLayers = {
  members: ComponentMember[];
  back: [number, number][][];
  wall: [number, number][][];
  rabbet: [number, number][][];
  plexi: [number, number][][];
};

export type ComponentError = {
  members: ComponentMember[];
  reason: "offset_collapsed" | "no_contours";
};

export type MergeWarning = {
  kind: "bridge_disconnected";
  pair: [ComponentMember, ComponentMember];
};

export type BuildResult = {
  components: ComponentMesh[];
  layers: ComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};

let worker: Worker | null = null;
let counter = 0;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export type WorkerResponse = {
  requestId: string;
  components: ComponentMesh[];
  layers: ComponentLayers[];
  errors: ComponentError[];
  warnings: MergeWarning[];
};

export function build(params: Parameters, fontBuffer: ArrayBuffer): Promise<BuildResult> {
  const w = ensureWorker();
  const requestId = String(++counter);
  const plainParams: Parameters = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
  };
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data?.requestId !== requestId) return;
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      resolve({
        components: ev.data.components,
        layers: ev.data.layers,
        errors: ev.data.errors,
        warnings: ev.data.warnings,
      });
    };
    const errorHandler = (e: ErrorEvent) => {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      reject(new Error(e.message || "Worker failed"));
    };
    w.addEventListener("message", handler);
    w.addEventListener("error", errorHandler);
    w.postMessage({
      kind: "build",
      requestId,
      params: plainParams,
      fontBuffer: fontBuffer.slice(0),
    });
  });
}
```

- [ ] **Step 2: Update worker.ts to emit one ComponentMesh per letter**

Replace `src/geometry/worker.ts`:

```ts
/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { Parameters } from "../state/parameters";
import type {
  ComponentMesh,
  ComponentLayers,
  ComponentError,
  MergeWarning,
  WorkerResponse,
} from "./worker-client";

type WorkerRequest = {
  kind: "build";
  requestId: string;
  params: Parameters;
  fontBuffer: ArrayBuffer;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind !== "build") return;

  const font = opentype.parse(req.fontBuffer);
  const scale = capHeightScale(font, req.params.letterHeight);

  const visibleChars: { ch: string; origIndex: number }[] = [];
  Array.from(req.params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleChars.push({ ch: c, origIndex: i });
  });

  const components: ComponentMesh[] = [];
  const layers: ComponentLayers[] = [];
  const errors: ComponentError[] = [];
  const warnings: MergeWarning[] = [];

  for (const { ch: char, origIndex } of visibleChars) {
    const glyph = font.charToGlyph(char);
    const rawContours = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const contours = rawContours.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );

    const member = { char, index: origIndex };

    const meshResult = await buildLetterShell({
      contours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
    });

    if (!meshResult.ok) {
      errors.push({ members: [member], reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);

    const plexiRaw = await buildLetterPlexi({
      contours,
      totalDepth: req.params.totalDepth,
      rabbetDepth: req.params.rabbetDepth,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    let plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
    if (plexiRaw) {
      const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
      const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
      const v = plexiRaw.vertProperties;
      const out = new Float32Array(v.length);
      for (let i = 0; i < v.length; i += 3) {
        out[i] = v[i] - cx;
        out[i + 1] = v[i + 1] - cy;
        out[i + 2] = v[i + 2];
      }
      plexi = { vertProperties: out, triVerts: plexiRaw.triVerts };
    }

    components.push({
      members: [member],
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
      xOffset: 0, // no word-space translation yet; layout positions are applied in PreviewLetter
      plexi,
    });

    const layerResult = await buildLetterLayers({
      contours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    if (layerResult) {
      layers.push({ members: [member], ...layerResult });
    }
  }

  const response: WorkerResponse = {
    requestId: req.requestId,
    components,
    layers,
    errors,
    warnings,
  };

  const transferables: Transferable[] = [];
  for (const c of components) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  ctx.postMessage(response, transferables);
};
```

(The `xOffset: 0` is a stopgap — `PreviewLetter` still receives `xOffset` from `layoutWord` for now. Task 6 wires the merge stage's `xOffset` through.)

- [ ] **Step 3: Update PreviewLetter.tsx to accept ComponentMesh**

Replace `src/ui/PreviewLetter.tsx`:

```ts
import { useMemo } from "react";
import * as THREE from "three";
import type { ComponentMesh } from "../geometry/worker-client";
import { useUI } from "../state/ui";

type Props = { component: ComponentMesh; xOffset: number };

function makeFlatGeometry(
  vertProperties: Float32Array,
  triVerts: Uint32Array,
): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(vertProperties, 3));
  indexed.setIndex(new THREE.BufferAttribute(triVerts, 1));
  // toNonIndexed() before computeVertexNormals() gives every triangle its own
  // vertices, so the normals match the face — sharp creases at every edge.
  const g = indexed.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function PreviewLetter({ component, xOffset }: Props) {
  const showPlexi = useUI((s) => s.showPlexi);

  const shellGeometry = useMemo(
    () => makeFlatGeometry(component.vertProperties, component.triVerts),
    [component],
  );

  const plexiGeometry = useMemo(() => {
    if (!component.plexi) return null;
    return makeFlatGeometry(component.plexi.vertProperties, component.plexi.triVerts);
  }, [component]);

  // The mesh was centered on its own bbox (so each STL exports centered).
  // To restore the natural word-space positioning here, shift back by the
  // original bbox center.
  const cx = (component.bbox.minX + component.bbox.maxX) / 2;
  const cy = (component.bbox.minY + component.bbox.maxY) / 2;

  return (
    <group position={[xOffset + cx, cy, 0]}>
      <mesh geometry={shellGeometry}>
        <meshStandardMaterial color="#5a5a5a" metalness={0} roughness={0.65} />
      </mesh>
      {showPlexi && plexiGeometry && (
        <mesh geometry={plexiGeometry}>
          <meshPhysicalMaterial
            color="#ffffff"
            roughness={0.85}
            metalness={0}
            transmission={0.6}
            thickness={2}
            ior={1.49}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
```

- [ ] **Step 4: Update PreviewCanvas.tsx to iterate components**

In `src/ui/PreviewCanvas.tsx`, replace the section that builds `lettersByIndex` and the JSX that renders `<PreviewLetter />`. Find:

```ts
  const positions = layoutFont ? layoutWord(layoutFont, params.text, params.letterHeight) : [];
  const lettersByIndex = new Map((result?.letters ?? []).map((l) => [l.index, l]));

  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleCharIndices.push(i);
  });
```

Replace with:

```ts
  const positions = layoutFont
    ? layoutWord(layoutFont, params.text, params.letterHeight, params.letterOverlap)
    : [];
  // Map a non-space original-text index to the component that owns it.
  // While Task 3 is in flight every component has exactly one member; once the
  // merge stage lands, multi-member components show up at the index of any one
  // of their members. We render one mesh per *component*, keyed by the leftmost
  // member's index, so we de-duplicate when multiple positions share a component.
  const componentByIndex = new Map<number, typeof result extends { components: infer C }
    ? C extends Array<infer M> ? M : never : never>();
  if (result) {
    for (const c of result.components) {
      for (const m of c.members) componentByIndex.set(m.index, c);
    }
  }

  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleCharIndices.push(i);
  });
```

Then find the JSX block:

```tsx
        {positions.map((p, i) => {
          const originalIndex = visibleCharIndices[i];
          const letter = lettersByIndex.get(originalIndex);
          if (!letter) return null;
          return <PreviewLetter key={`${i}-${p.char}`} letter={letter} xOffset={p.xOffset} />;
        })}
```

Replace with:

```tsx
        {(() => {
          const renderedComponents = new Set<unknown>();
          return positions.map((p, i) => {
            const originalIndex = visibleCharIndices[i];
            const component = componentByIndex.get(originalIndex);
            if (!component) return null;
            // Render each component once, at its leftmost member's xOffset.
            if (renderedComponents.has(component)) return null;
            renderedComponents.add(component);
            const leftmost = component.members[0];
            const leftmostPosIdx = visibleCharIndices.indexOf(leftmost.index);
            const xOffset = leftmostPosIdx >= 0 ? positions[leftmostPosIdx].xOffset : p.xOffset;
            return <PreviewLetter key={`${i}-${p.char}`} component={component} xOffset={xOffset} />;
          });
        })()}
```

Also find:

```ts
    if (!result || result.letters.length === 0) return;
```

Inside the `useEffect` of `SceneSetup`, replace `result.letters.length` with `result.components.length`.

Find the errors block at the bottom:

```tsx
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>Letter &lsquo;{e.char}&rsquo;: {e.reason}</div>
          ))}
        </div>
      )}
```

Replace with:

```tsx
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>
              {e.members.length === 1 ? "Letter" : "Component"} &lsquo;
              {e.members.map((m) => m.char).join("")}
              &rsquo;: {e.reason}
            </div>
          ))}
        </div>
      )}
```

Add a warnings section just below it:

```tsx
      {result && result.warnings.length > 0 && (
        <div className="preview-warnings">
          {result.warnings.map((w, i) => (
            <div key={i}>
              Bridge disconnected between &lsquo;{w.pair[0].char}&rsquo; and &lsquo;
              {w.pair[1].char}&rsquo;
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 5: Update ExportButtons.tsx for components**

In `src/ui/ExportButtons.tsx`, find:

```tsx
  async function exportZip() {
    if (!result || result.letters.length === 0) return;
    setBusy(true);
    try {
      const stls = result.letters.map((l) => ({
        char: l.char,
        index: l.index,
        stl: meshToBinarySTL({ vertProperties: l.vertProperties, triVerts: l.triVerts }),
      }));
      const plexis = result.layers.map((l) => ({
        char: l.char,
        index: l.index,
        svg: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
```

Replace with:

```tsx
  async function exportZip() {
    if (!result || result.components.length === 0) return;
    setBusy(true);
    try {
      const stls = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
      }));
      const plexis = result.layers.map((l) => ({
        chars: l.members.map((m) => m.char).join(""),
        svg: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
```

Find:

```tsx
  const empty = !result || result.letters.length === 0;
```

Replace `result.letters.length` with `result.components.length`.

Find `buildReproduceUrl` and add the new fields:

```tsx
function buildReproduceUrl(params: Parameters): string {
  const serializable = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
  };
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("p", JSON.stringify(serializable));
  return url.toString();
}
```

- [ ] **Step 6: Update zip.ts to take chars instead of char**

Replace `src/exporters/zip.ts`:

```ts
import JSZip from "jszip";

function safeFilenameFragment(chars: string, fallback: string): string {
  const cleaned = chars.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type STLEntry = { chars: string; stl: ArrayBuffer };
export type PlexiEntry = { chars: string; svg: string };

// Bundle one zip with stl/ and plexi/ subfolders plus a README at the root.
// Filenames use the joined member chars per component, sanitized to a safe
// subset; the slot index (1-based) is the zero-padded prefix.
export async function bundleAll(
  stls: STLEntry[],
  plexis: PlexiEntry[],
  readme: string,
): Promise<Blob> {
  const zip = new JSZip();
  const stlDir = zip.folder("stl");
  const plexiDir = zip.folder("plexi");
  if (!stlDir || !plexiDir) throw new Error("zip folder creation failed");

  stls.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}.stl`;
    stlDir.file(name, e.stl);
  });
  plexis.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}.svg`;
    plexiDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 7: Update zip.test.ts for new shape**

Replace `tests/unit/exporters/zip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleAll } from "../../../src/exporters/zip";

describe("bundleAll", () => {
  it("packages stls under stl/ and plexis under plexi/, plus README at root", async () => {
    const blob = await bundleAll(
      [
        { chars: "M", stl: new ArrayBuffer(84) },
        { chars: "i", stl: new ArrayBuffer(84) },
      ],
      [
        { chars: "M", svg: "<svg/>" },
        { chars: "i", svg: "<svg/>" },
      ],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_M.stl")).toBeTruthy();
    expect(zip.file("stl/02_i.stl")).toBeTruthy();
    expect(zip.file("plexi/01_M.svg")).toBeTruthy();
    expect(zip.file("plexi/02_i.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeNull();
  });

  it("uses joined member chars for connected components", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [{ chars: "BURGER", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_BURGER.stl")).toBeTruthy();
    expect(zip.file("plexi/01_BURGER.svg")).toBeTruthy();
  });

  it("falls back to component<slot> when chars sanitize to empty", async () => {
    const blob = await bundleAll(
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_component1.stl")).toBeTruthy();
    expect(zip.file("plexi/01_component1.svg")).toBeTruthy();
  });

  it("strips disallowed characters", async () => {
    const blob = await bundleAll(
      [{ chars: "Hi/?", stl: new ArrayBuffer(84) }],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_Hi.stl")).toBeTruthy();
  });

  it("README content lands at the root", async () => {
    const readme = "Reproduce: http://example.com/?p=...\nText: BURGER";
    const blob = await bundleAll([], [], readme);
    const zip = await JSZip.loadAsync(blob);
    const f = zip.file("README.txt");
    expect(f).toBeTruthy();
    if (f) {
      const txt = await f.async("text");
      expect(txt).toBe(readme);
    }
  });
});
```

- [ ] **Step 8: Update usePreviewBuild.ts to depend on new params**

In `src/ui/usePreviewBuild.ts`, find the dependency array at the bottom and add the four new params:

```ts
  ], [
    params.text,
    params.fontSource,
    params.letterHeight,
    params.wallThickness,
    params.totalDepth,
    params.backThickness,
    params.rabbetDepth,
    params.insetWidth,
    params.bezierTolerance,
    params.letterOverlap,
    params.bridgeWidth,
    params.bridgeHeight,
    params.bridgeY,
  ]);
```

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: PASS for all unit tests.

- [ ] **Step 10: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 11: Run dev server and verify a build still works**

Run: `npm run dev` (in background)

Open <http://localhost:5173>, type "Hi", confirm preview shows two letters. (No automated check; this is a smoke check before committing the contract change.)

Stop the dev server.

- [ ] **Step 12: Commit**

```bash
git add src/geometry/worker-client.ts src/geometry/worker.ts \
  src/ui/PreviewLetter.tsx src/ui/PreviewCanvas.tsx \
  src/ui/ExportButtons.tsx src/ui/usePreviewBuild.ts \
  src/exporters/zip.ts tests/unit/exporters/zip.test.ts
git commit -m "refactor: worker emits components instead of letters

Renames LetterMesh/Layers/Error to ComponentMesh/Layers/Error,
each carrying members[] and (preview-side) xOffset. The worker
still produces one component per visible letter; merge stage
lands later. All consumers updated. README/zip filenames now key
off joined member chars with a sanitized fallback."
```

---

## Task 4: README and Pieces section

**Files:**
- Modify: `src/exporters/manifest.ts`
- Create: `tests/unit/exporters/manifest.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/exporters/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReadme } from "../../../src/exporters/manifest";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("buildReadme", () => {
  it("includes the new connected-letters params", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, letterOverlap: 5, bridgeWidth: 12, bridgeHeight: 4, bridgeY: -50 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Letter overlap:");
    expect(txt).toContain("5");
    expect(txt).toContain("Bridge width:");
    expect(txt).toContain("12");
    expect(txt).toContain("Bridge height:");
    expect(txt).toContain("Bridge Y:");
  });

  it("includes a Pieces section listing components when given them", () => {
    const txt = buildReadme(
      DEFAULT_PARAMETERS,
      "https://example.com/?p=foo",
      [
        { chars: "BUR", count: 3 },
        { chars: "GER", count: 3 },
      ],
    );
    expect(txt).toContain("Pieces:");
    expect(txt).toContain("01_BUR");
    expect(txt).toContain("02_GER");
  });

  it("omits Pieces section when no pieces given", () => {
    const txt = buildReadme(DEFAULT_PARAMETERS, "https://example.com/?p=foo");
    expect(txt).not.toContain("Pieces:");
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: FAIL — `buildReadme` only takes two args; new params not printed.

- [ ] **Step 3: Update buildReadme**

Replace `src/exporters/manifest.ts`:

```ts
import type { Parameters } from "../state/parameters";

function describeFont(source: Parameters["fontSource"]): string {
  if (source.kind === "bundled") return `${source.id} (bundled)`;
  return `${source.name} (uploaded, sha256 ${source.sha256.slice(0, 16)}…)`;
}

export type PieceDescriptor = { chars: string; count: number };

// Build the human-readable README that ships at the root of the export zip.
// Includes a reproduce-URL (with the parameters encoded as `?p=…`) so the
// user can paste it back into a browser to recreate this exact export.
export function buildReadme(
  params: Parameters,
  reproduceUrl: string,
  pieces?: PieceDescriptor[],
): string {
  const lines: string[] = [
    `Lightbox letter generator output`,
    ``,
    `Generated:  ${new Date().toISOString()}`,
    ``,
    `Reproduce this download:`,
    `  ${reproduceUrl}`,
    ``,
    `Parameters:`,
    `  Text:              ${params.text}`,
    `  Font:              ${describeFont(params.fontSource)}`,
    `  Letter height:     ${params.letterHeight} mm`,
    `  Wall thickness:    ${params.wallThickness} mm`,
    `  Total depth:       ${params.totalDepth} mm`,
    `  Back thickness:    ${params.backThickness} mm`,
    `  Rabbet depth:      ${params.rabbetDepth} mm`,
    `  Inset width:       ${params.insetWidth} mm`,
    `  Bezier tolerance:  ${params.bezierTolerance} mm`,
    `  Letter overlap:    ${params.letterOverlap} mm`,
    `  Bridge width:      ${params.bridgeWidth} mm`,
    `  Bridge height:     ${params.bridgeHeight} mm`,
    `  Bridge Y:          ${params.bridgeY} mm`,
    ``,
    `Files in this archive:`,
    `  stl/NN_<chars>.stl    — 3D-printable shells (one per connected component)`,
    `  plexi/NN_<chars>.svg  — plexi cut shapes (cut these from acrylic)`,
    ``,
    `NN preserves left-to-right order. Spaces are skipped.`,
    ``,
  ];

  if (pieces && pieces.length > 0) {
    lines.push(`Pieces:`);
    pieces.forEach((p, i) => {
      const slot = (i + 1).toString().padStart(2, "0");
      lines.push(`  ${slot}_${p.chars}  (${p.count} ${p.count === 1 ? "letter" : "letters"})`);
    });
    lines.push(``);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Pass pieces from ExportButtons**

In `src/ui/ExportButtons.tsx`, find where `buildReadme` is called:

```tsx
      const readme = buildReadme(params, buildReproduceUrl(params));
```

Replace with:

```tsx
      const pieces = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        count: c.members.length,
      }));
      const readme = buildReadme(params, buildReproduceUrl(params), pieces);
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run tests/unit/exporters/manifest.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all tests, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/exporters/manifest.ts src/ui/ExportButtons.tsx tests/unit/exporters/manifest.test.ts
git commit -m "feat: README lists connected-letters params and Pieces section

buildReadme now prints the four new params and accepts an optional
PieceDescriptor[] that's rendered as a Pieces section listing each
component slot and its joined member chars."
```

---

## Task 5: merge.ts module

This is the heart of the feature: a pure function that takes the layout and per-glyph contours and returns connected components plus warnings. Implemented with TDD.

**Files:**
- Create: `src/geometry/merge.ts`
- Create: `tests/unit/geometry/merge.test.ts`

- [ ] **Step 1: Write failing test for the no-merge baseline**

Create `tests/unit/geometry/merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeIntoComponents } from "../../../src/geometry/merge";
import type { GlyphContours } from "../../../src/geometry/types";
import type { LayoutEntry } from "../../../src/geometry/layout";
import opentype from "opentype.js";

// Helper: build a square contour at (cx,cy) with side `s`. CCW for outer.
function square(cx: number, cy: number, s: number): GlyphContours {
  const h = s / 2;
  return [[
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h],
  ]];
}

// Helper: a fake LayoutEntry. The glyph is unused by mergeIntoComponents but
// the type wants one; we cast a minimal stub.
function entry(char: string, xOffset: number): LayoutEntry {
  return { char, glyph: {} as opentype.Glyph, xOffset };
}

describe("mergeIntoComponents", () => {
  it("returns one component per letter when nothing overlaps and no bridges", async () => {
    const layout: LayoutEntry[] = [entry("A", 0), entry("B", 100)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],   // [-25..25]
      [1, square(0, 0, 50)],   // [-25..25] before translation; will sit at [75..125]
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(2);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A"]);
    expect(result.components[1].members.map((m) => m.char)).toEqual(["B"]);
    expect(result.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/unit/geometry/merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement merge.ts (no-merge baseline + helper structure)**

Create `src/geometry/merge.ts`:

```ts
import { getManifold } from "./manifold-init";
import type { GlyphContours, Polygon } from "./types";
import type { LayoutEntry } from "./layout";

export type ComponentMember = {
  char: string;
  index: number; // original-text index, including spaces
  xOffset: number;
};

export type Component = {
  members: ComponentMember[];
  mergedContours: GlyphContours; // in word space, ready to shell
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export type MergeWarning = {
  kind: "bridge_disconnected";
  pair: [{ char: string; index: number }, { char: string; index: number }];
};

export type MergeParams = {
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
};

export type MergeResult = {
  components: Component[];
  warnings: MergeWarning[];
};

type LetterItem = {
  kind: "letter";
  member: ComponentMember;
  contours: GlyphContours; // already translated to word space
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type BridgeItem = {
  kind: "bridge";
  fromIdx: number; // index into letters[]
  toIdx: number;
  contours: GlyphContours;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

function translatePolygon(p: Polygon, dx: number, dy: number): Polygon {
  return p.map(([x, y]) => [x + dx, y + dy] as [number, number]);
}

function translateContours(c: GlyphContours, dx: number, dy: number): GlyphContours {
  return c.map((p) => translatePolygon(p, dx, dy));
}

function bboxOfContours(c: GlyphContours): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of c) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxesOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.maxX >= b.minX && b.maxX >= a.minX && a.maxY >= b.minY && b.maxY >= a.minY;
}

export async function mergeIntoComponents(
  layout: LayoutEntry[],
  glyphContours: Map<number, GlyphContours>,
  params: MergeParams,
): Promise<MergeResult> {
  const m = await getManifold();
  const { CrossSection } = m;

  // 1. Translate each glyph's contours to word space.
  // Note: layout's `xOffset` already reflects letterOverlap (if non-zero) via
  // layoutWord. The merge step does not re-apply overlap; it consumes positions
  // as given.
  const letters: LetterItem[] = [];
  let layoutIndex = 0;
  for (const entry of layout) {
    const contours = glyphContours.get(layoutIndex) ?? glyphContours.get(letters.length);
    layoutIndex++;
    if (!contours || contours.length === 0) continue;
    const translated = translateContours(contours, entry.xOffset, 0);
    letters.push({
      kind: "letter",
      member: { char: entry.char, index: letters.length, xOffset: entry.xOffset },
      contours: translated,
      bbox: bboxOfContours(translated),
    });
  }

  const warnings: MergeWarning[] = [];
  const bridges: BridgeItem[] = [];

  // 2. Build bridges between consecutive letter pairs.
  const bridgeEnabled = params.bridgeWidth > 0 && params.bridgeHeight > 0;
  if (bridgeEnabled) {
    for (let i = 0; i + 1 < letters.length; i++) {
      const a = letters[i];
      const b = letters[i + 1];
      const center = (a.bbox.maxX + b.bbox.minX) / 2;
      const halfW = params.bridgeWidth / 2;
      const halfH = params.bridgeHeight / 2;
      const x0 = center - halfW;
      const x1 = center + halfW;
      const y0 = params.bridgeY - halfH;
      const y1 = params.bridgeY + halfH;
      const rect: GlyphContours = [[
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]];
      const bbox = bboxOfContours(rect);

      // Check bridge actually intersects both endpoints. AABB pre-filter.
      const touchesA = bboxesOverlap(bbox, a.bbox) && crossSectionsIntersect(rect, a.contours, CrossSection);
      const touchesB = bboxesOverlap(bbox, b.bbox) && crossSectionsIntersect(rect, b.contours, CrossSection);
      if (!touchesA || !touchesB) {
        warnings.push({
          kind: "bridge_disconnected",
          pair: [
            { char: a.member.char, index: a.member.index },
            { char: b.member.char, index: b.member.index },
          ],
        });
        continue;
      }

      bridges.push({
        kind: "bridge",
        fromIdx: i,
        toIdx: i + 1,
        contours: rect,
        bbox,
      });
    }
  }

  // 3. Connectivity via union-find over letters; bridge edges + letter-letter
  //    overlap edges. We probe letter-letter overlap pairwise (n^2; n is small,
  //    typically ≤ 32 for sign words).
  const parent = letters.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      if (!bboxesOverlap(letters[i].bbox, letters[j].bbox)) continue;
      if (crossSectionsIntersect(letters[i].contours, letters[j].contours, CrossSection)) {
        union(i, j);
      }
    }
  }
  for (const br of bridges) union(br.fromIdx, br.toIdx);

  // 4. Materialize components.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < letters.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }

  // Sort groups by leftmost member's xOffset.
  const groupRoots = [...groups.keys()].sort((a, b) => {
    const xa = Math.min(...groups.get(a)!.map((idx) => letters[idx].member.xOffset));
    const xb = Math.min(...groups.get(b)!.map((idx) => letters[idx].member.xOffset));
    return xa - xb;
  });

  const components: Component[] = [];
  for (const r of groupRoots) {
    const members = groups.get(r)!.slice().sort((a, b) => letters[a].member.xOffset - letters[b].member.xOffset);
    const bridgesIn = bridges.filter((br) => members.includes(br.fromIdx) || members.includes(br.toIdx));

    let mergedContours: GlyphContours;
    if (members.length === 1 && bridgesIn.length === 0) {
      // Fast path: pass through the translated contours unchanged. No CrossSection round-trip.
      mergedContours = letters[members[0]].contours;
    } else {
      mergedContours = unionAll(
        [...members.map((idx) => letters[idx].contours), ...bridgesIn.map((br) => br.contours)],
        CrossSection,
      );
    }
    components.push({
      members: members.map((idx) => letters[idx].member),
      mergedContours,
      bbox: bboxOfContours(mergedContours),
    });
  }

  return { components, warnings };
}

// Pairwise CrossSection.intersect non-empty test. Allocates two CrossSections,
// computes the intersection, checks isEmpty, and deletes everything.
function crossSectionsIntersect(
  a: GlyphContours,
  b: GlyphContours,
  CrossSection: typeof import("manifold-3d").CrossSection,
): boolean {
  const csA = new CrossSection(a, "NonZero");
  const csB = new CrossSection(b, "NonZero");
  const inter = csA.intersect(csB);
  const empty = inter.isEmpty();
  csA.delete();
  csB.delete();
  inter.delete();
  return !empty;
}

// Union a list of contour sets and return the union's polygons. Deletes every
// intermediate CrossSection.
function unionAll(
  sets: GlyphContours[],
  CrossSection: typeof import("manifold-3d").CrossSection,
): GlyphContours {
  if (sets.length === 0) return [];
  let acc: import("manifold-3d").CrossSection | null = new CrossSection(sets[0], "NonZero");
  for (let i = 1; i < sets.length; i++) {
    const next = new CrossSection(sets[i], "NonZero");
    const merged = acc.add(next);
    acc.delete();
    next.delete();
    acc = merged;
  }
  const polys = acc.toPolygons() as GlyphContours;
  acc.delete();
  return polys;
}
```

A note on the `glyphContours` keying: the worker passes a `Map<number, GlyphContours>` keyed by **original text index** (so spaces have no entry). The implementation above treats the key as the original index; the `layoutIndex++` walk through `layout` lines them up. We don't currently use the original index for anything inside merge.ts — the `member.index` we expose is the position in the non-space sequence. (See spec: "members carry the original text index.") We'll fix this when we wire merge.ts into the worker (Task 6) — for now the unit test fixture passes contours keyed `0..n-1` matching the layout entries, and the worker will pass them keyed by original index; we'll thread the original index through then.

Replace the relevant block in `mergeIntoComponents` to accept that the map is keyed by an arbitrary stable identifier and that `LayoutEntry` should carry the original index. To avoid a bigger refactor, **extend `LayoutEntry`** to include `originalIndex`. Update the file structure accordingly:

(See Task 6, Step 1, where we add `originalIndex` to `LayoutEntry` and re-key the contours map.)

For Task 5 we keep the test fixture aligned with what merge.ts consumes today and revisit in Task 6.

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/unit/geometry/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Add overlap merge test**

Append to `tests/unit/geometry/merge.test.ts`:

```ts
  it("merges two letters whose translated outlines overlap", async () => {
    // A is at xOffset=0 (occupies [-25..25]); B at xOffset=30 (occupies [5..55]).
    const layout: LayoutEntry[] = [entry("A", 0), entry("B", 30)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0, // already encoded in the xOffsets above
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(1);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A", "B"]);
    expect(result.warnings).toEqual([]);
  });

  it("partial overlap: first two merge, third stays separate", async () => {
    const layout: LayoutEntry[] = [entry("A", 0), entry("B", 30), entry("C", 200)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
      [2, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 0,
      bridgeHeight: 0,
      bridgeY: -50,
    });
    expect(result.components.length).toBe(2);
    expect(result.components[0].members.map((m) => m.char)).toEqual(["A", "B"]);
    expect(result.components[1].members.map((m) => m.char)).toEqual(["C"]);
  });

  it("bridge merges two non-overlapping letters", async () => {
    // A at [-25..25], B at [75..125]. Bridge span 100mm centered at 50 → [0..100].
    // Bridge height 10mm centered at 0 → [-5..5]. Bridge enters both squares.
    const layout: LayoutEntry[] = [entry("A", 0), entry("B", 100)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 100,
      bridgeHeight: 10,
      bridgeY: 0,
    });
    expect(result.components.length).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("bridge_disconnected warning fires when bar misses one letter", async () => {
    const layout: LayoutEntry[] = [entry("A", 0), entry("B", 100)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
    // Bridge Y is far above both squares' tops (y=25); they sit at [-25..25] in Y.
    const result = await mergeIntoComponents(layout, contours, {
      letterOverlap: 0,
      bridgeWidth: 200,
      bridgeHeight: 4,
      bridgeY: 100,
    });
    expect(result.components.length).toBe(2);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].kind).toBe("bridge_disconnected");
  });
```

- [ ] **Step 6: Run merge tests, verify all pass**

Run: `npx vitest run tests/unit/geometry/merge.test.ts`
Expected: all PASS.

- [ ] **Step 7: Run full test suite, lint, typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean. (Worker-side wiring in Task 6 still pending; the new merge module is not yet imported anywhere.)

- [ ] **Step 8: Commit**

```bash
git add src/geometry/merge.ts tests/unit/geometry/merge.test.ts
git commit -m "feat: merge.ts pre-merge stage with overlap + bridges

Pure module that translates glyphs to word space, optionally adds
horizontal bridge bars between consecutive non-space pairs, runs
union-find by CrossSection.intersect non-empty, and unions each
group into one merged contour set. Emits bridge_disconnected
warnings for bars that don't actually touch their endpoints. Not
yet wired into the worker."
```

---

## Task 6: Wire merge.ts into worker.ts

Worker now invokes `mergeIntoComponents` between layout and shell. We thread the original text index through `LayoutEntry` so members carry it, and key the contours map accordingly.

**Files:**
- Modify: `src/geometry/layout.ts`
- Modify: `tests/unit/geometry/layout.test.ts`
- Modify: `src/geometry/merge.ts`
- Modify: `tests/unit/geometry/merge.test.ts`
- Modify: `src/geometry/worker.ts`

- [ ] **Step 1: Add originalIndex to LayoutEntry, write failing test**

Append to `tests/unit/geometry/layout.test.ts`:

```ts
describe("layoutWord originalIndex", () => {
  const font = loadFont();

  it("carries the original text index for non-space glyphs", () => {
    const result = layoutWord(font, "A B", 100, 0);
    expect(result.length).toBe(2);
    expect(result[0].originalIndex).toBe(0);
    expect(result[1].originalIndex).toBe(2); // space at index 1 is skipped
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/unit/geometry/layout.test.ts`
Expected: FAIL — `originalIndex` is `undefined`.

- [ ] **Step 3: Add originalIndex to LayoutEntry**

In `src/geometry/layout.ts`, update `LayoutEntry` and the entry push:

```ts
export type LayoutEntry = {
  char: string;
  glyph: opentype.Glyph;
  xOffset: number;
  originalIndex: number; // index into Array.from(text), including spaces
};
```

In the loop, change:

```ts
    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale });
    }
```

to:

```ts
    if (!isSpace) {
      entries.push({ char: ch, glyph, xOffset: cursorFu * scale, originalIndex: i });
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/unit/geometry/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Update merge.ts to use originalIndex and a contours map keyed by it**

In `src/geometry/merge.ts`, replace the translate loop. Find:

```ts
  const letters: LetterItem[] = [];
  let layoutIndex = 0;
  for (const entry of layout) {
    const contours = glyphContours.get(layoutIndex) ?? glyphContours.get(letters.length);
    layoutIndex++;
    if (!contours || contours.length === 0) continue;
    const translated = translateContours(contours, entry.xOffset, 0);
    letters.push({
      kind: "letter",
      member: { char: entry.char, index: letters.length, xOffset: entry.xOffset },
      contours: translated,
      bbox: bboxOfContours(translated),
    });
  }
```

Replace with:

```ts
  const letters: LetterItem[] = [];
  for (const entry of layout) {
    const contours = glyphContours.get(entry.originalIndex);
    if (!contours || contours.length === 0) continue;
    const translated = translateContours(contours, entry.xOffset, 0);
    letters.push({
      kind: "letter",
      member: { char: entry.char, index: entry.originalIndex, xOffset: entry.xOffset },
      contours: translated,
      bbox: bboxOfContours(translated),
    });
  }
```

- [ ] **Step 6: Update merge.ts test fixtures to use originalIndex**

In `tests/unit/geometry/merge.test.ts`, update the `entry` helper to take `originalIndex` and update each call. Replace:

```ts
function entry(char: string, xOffset: number): LayoutEntry {
  return { char, glyph: {} as opentype.Glyph, xOffset };
}
```

with:

```ts
function entry(char: string, xOffset: number, originalIndex: number): LayoutEntry {
  return { char, glyph: {} as opentype.Glyph, xOffset, originalIndex };
}
```

Then update each `entry(...)` call to pass an originalIndex and re-key the contours map. For example:

```ts
    const layout: LayoutEntry[] = [entry("A", 0, 0), entry("B", 100, 1)];
    const contours = new Map<number, GlyphContours>([
      [0, square(0, 0, 50)],
      [1, square(0, 0, 50)],
    ]);
```

Apply the same shape to all four `it(...)` cases, choosing originalIndex values that match the layout (0, 1 for two-letter cases; 0, 1, 2 for three).

- [ ] **Step 7: Run merge tests, verify pass**

Run: `npx vitest run tests/unit/geometry/merge.test.ts`
Expected: PASS.

- [ ] **Step 8: Wire worker.ts to call mergeIntoComponents**

Replace `src/geometry/worker.ts`:

```ts
/// <reference lib="webworker" />
import opentype from "opentype.js";
import { flattenGlyph } from "./flatten";
import { capHeightScale } from "./scale";
import { layoutWord } from "./layout";
import { mergeIntoComponents } from "./merge";
import { buildLetterShell, buildLetterPlexi, centerMeshXY } from "./shell";
import { buildLetterLayers } from "../exporters/svg";
import type { GlyphContours } from "./types";
import type { Parameters } from "../state/parameters";
import type {
  ComponentMesh,
  ComponentLayers,
  ComponentError,
  MergeWarning,
  WorkerResponse,
} from "./worker-client";

type WorkerRequest = {
  kind: "build";
  requestId: string;
  params: Parameters;
  fontBuffer: ArrayBuffer;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind !== "build") return;

  const font = opentype.parse(req.fontBuffer);
  const scale = capHeightScale(font, req.params.letterHeight);

  // Build a contour map keyed by the *original text index* (skipping spaces).
  const contoursByIndex = new Map<number, GlyphContours>();
  Array.from(req.params.text).forEach((ch, i) => {
    if (/\s/.test(ch)) return;
    const glyph = font.charToGlyph(ch);
    const raw = flattenGlyph(glyph, font.unitsPerEm, req.params.bezierTolerance);
    const scaled = raw.map(
      (p) => p.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    );
    contoursByIndex.set(i, scaled);
  });

  const layout = layoutWord(font, req.params.text, req.params.letterHeight, req.params.letterOverlap);

  const merged = await mergeIntoComponents(layout, contoursByIndex, {
    letterOverlap: req.params.letterOverlap,
    bridgeWidth: req.params.bridgeWidth,
    bridgeHeight: req.params.bridgeHeight,
    bridgeY: req.params.bridgeY,
  });

  const components: ComponentMesh[] = [];
  const layers: ComponentLayers[] = [];
  const errors: ComponentError[] = [];
  const warnings: MergeWarning[] = merged.warnings;

  for (const comp of merged.components) {
    const memberRefs = comp.members.map((m) => ({ char: m.char, index: m.index }));

    const meshResult = await buildLetterShell({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      backThickness: req.params.backThickness,
      wallThickness: req.params.wallThickness,
      rabbetDepth: req.params.rabbetDepth,
      insetWidth: req.params.insetWidth,
    });

    if (!meshResult.ok) {
      errors.push({ members: memberRefs, reason: meshResult.reason });
      continue;
    }

    const centered = centerMeshXY(meshResult.mesh);

    const plexiRaw = await buildLetterPlexi({
      contours: comp.mergedContours,
      totalDepth: req.params.totalDepth,
      rabbetDepth: req.params.rabbetDepth,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    let plexi: { vertProperties: Float32Array; triVerts: Uint32Array } | null = null;
    if (plexiRaw) {
      const cx = (centered.bbox.minX + centered.bbox.maxX) / 2;
      const cy = (centered.bbox.minY + centered.bbox.maxY) / 2;
      const v = plexiRaw.vertProperties;
      const out = new Float32Array(v.length);
      for (let i = 0; i < v.length; i += 3) {
        out[i] = v[i] - cx;
        out[i + 1] = v[i + 1] - cy;
        out[i + 2] = v[i + 2];
      }
      plexi = { vertProperties: out, triVerts: plexiRaw.triVerts };
    }

    components.push({
      members: memberRefs,
      vertProperties: centered.vertProperties,
      triVerts: centered.triVerts,
      bbox: centered.bbox,
      // The component bbox in word space; preview combines this with the
      // mesh's per-component centering shift.
      xOffset: comp.bbox.minX,
      plexi,
    });

    const layerResult = await buildLetterLayers({
      contours: comp.mergedContours,
      wallThickness: req.params.wallThickness,
      insetWidth: req.params.insetWidth,
    });
    if (layerResult) {
      layers.push({ members: memberRefs, ...layerResult });
    }
  }

  const response: WorkerResponse = {
    requestId: req.requestId,
    components,
    layers,
    errors,
    warnings,
  };

  const transferables: Transferable[] = [];
  for (const c of components) {
    transferables.push(c.vertProperties.buffer, c.triVerts.buffer);
    if (c.plexi) {
      transferables.push(c.plexi.vertProperties.buffer, c.plexi.triVerts.buffer);
    }
  }
  ctx.postMessage(response, transferables);
};
```

- [ ] **Step 9: Update PreviewCanvas/PreviewLetter to use the merged xOffset**

Now that the worker provides an `xOffset` in word space, `PreviewCanvas` no longer needs to consult `layoutWord` for placement. But the current preview also uses layout for mapping non-space char index to position; we'll keep that for the rendered-component dedup logic.

In `src/ui/PreviewCanvas.tsx`, replace the JSX block that renders components. Find the `(() => { … })()` block from Task 3, Step 4 and replace with a simpler version that uses the component's own `xOffset`:

```tsx
        {result?.components.map((c, i) => (
          <PreviewLetter key={i} component={c} xOffset={c.xOffset} />
        )) ?? null}
```

Remove the `componentByIndex` map, the `renderedComponents` set, and the `positions`/`visibleCharIndices` machinery they fed (preserve the layout for any other consumers — actually, those are no longer needed now that placement uses `c.xOffset`). Delete:

```ts
  const positions = layoutFont
    ? layoutWord(layoutFont, params.text, params.letterHeight, params.letterOverlap)
    : [];
  const componentByIndex = new Map<...>();
  if (result) { ... }
  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleCharIndices.push(i);
  });
```

If `layoutFont` and `layoutWord` aren't used elsewhere in the file after this, also remove their imports/usages. Verify that `usePreviewBuildContext`'s `layoutFont` is still consumed — if not, prune it from the context too (out of scope; if pruning is needed it gets its own commit).

- [ ] **Step 10: Run full test suite**

Run: `npm test`
Expected: PASS for all unit tests.

- [ ] **Step 11: Run dev server, smoke-test in browser**

Run: `npm run dev` in background. Open <http://localhost:5173>.

- Confirm "BURGER" still renders as 6 separate shells (default `letterOverlap=0`, no bridge).
- Open the URL with `?p={…,"letterOverlap":40,"bridgeWidth":0,…}` (paste manually) and confirm the letters merge into fewer shells.

Stop the dev server.

- [ ] **Step 12: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add src/geometry/layout.ts src/geometry/merge.ts src/geometry/worker.ts \
  src/ui/PreviewCanvas.tsx tests/unit/geometry/layout.test.ts \
  tests/unit/geometry/merge.test.ts
git commit -m "feat: wire merge stage into worker

Worker builds a contour map keyed by original text index, runs
layoutWord (now with letterOverlap), then mergeIntoComponents,
and shells each component on the merged contours. Preview
positions components by their own word-space xOffset."
```

---

## Task 7: Connectors UI fieldset

**Files:**
- Modify: `src/ui/ControlsPanel.tsx`

- [ ] **Step 1: Add Connectors fieldset to ControlsPanel**

In `src/ui/ControlsPanel.tsx`, insert a new fieldset after the existing "Plexi inset" fieldset and before the `<details>`:

```tsx
      <fieldset>
        <legend>Connectors</legend>
        <NumberField
          label="Letter overlap"
          unit="mm"
          value={params.letterOverlap}
          onChange={(v) => params.set({ letterOverlap: v })}
          error={errorFor(errs, "letterOverlap")}
        />
        <NumberField
          label="Bridge width"
          unit="mm"
          value={params.bridgeWidth}
          onChange={(v) => params.set({ bridgeWidth: v })}
          error={errorFor(errs, "bridgeWidth")}
        />
        <NumberField
          label="Bridge height"
          unit="mm"
          value={params.bridgeHeight}
          onChange={(v) => params.set({ bridgeHeight: v })}
          error={errorFor(errs, "bridgeHeight")}
        />
        <NumberField
          label="Bridge Y"
          unit="mm"
          value={params.bridgeY}
          onChange={(v) => params.set({ bridgeY: v })}
          error={errorFor(errs, "bridgeY")}
        />
      </fieldset>
```

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Smoke-test in browser**

Run: `npm run dev` in background. Open <http://localhost:5173>.

- Drag "Letter overlap" up; confirm letters get pulled together and merge as it crosses the natural gap.
- Set "Letter overlap" back to 0; set "Bridge width" 30, "Bridge height" 4, "Bridge Y" -100; confirm horizontal bars appear connecting letters into one component. (For BURGER at 200mm height, mid-letter is around Y=-100.)
- Set "Bridge Y" to 200; confirm a bridge_disconnected warning appears under the canvas and letters stay separate.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ControlsPanel.tsx
git commit -m "feat: Connectors fieldset for letter overlap and bridges"
```

---

## Task 8: E2E smoke covers connected mode

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Extend the smoke test**

Replace `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, download zip", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);
  expect(zip.file("stl/01_H.stl")).toBeTruthy();
  expect(zip.file("stl/02_i.stl")).toBeTruthy();
  expect(zip.file("plexi/01_H.svg")).toBeTruthy();
  expect(zip.file("plexi/02_i.svg")).toBeTruthy();
  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Reproduce");
    expect(text).toContain("?p=");
    expect(text).toContain("Hi");
    expect(text).toContain("Letter overlap:");
  }
  expect(zip.file("manifest.json")).toBeNull();
});

test("end-to-end: connected mode merges letters into one STL", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");
  // Pull H and i together far enough that their outlines overlap.
  // Inter "H" is ~50mm wide at 80mm tall; an overlap of ~30mm closes the gap.
  await page.getByLabel("Letter overlap").fill("30");

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // One merged STL named with both chars (letter order preserved).
  expect(zip.file("stl/01_Hi.stl")).toBeTruthy();
  expect(zip.file("plexi/01_Hi.svg")).toBeTruthy();
  // No per-letter STLs.
  expect(zip.file("stl/01_H.stl")).toBeNull();
  expect(zip.file("stl/02_i.stl")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Pieces:");
    expect(text).toContain("01_Hi");
  }
});
```

- [ ] **Step 2: Run e2e test**

Run: `npm run e2e`
Expected: both tests PASS.

If the second test fails because `30mm` doesn't merge at this font, increase to `40` or `50`. The threshold depends on Inter's "H" advance width at 80mm cap height. Adjust until `01_Hi.stl` exists.

- [ ] **Step 3: Run full check (unit + lint + typecheck)**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "test: e2e smoke covers connected mode

Adds a second case that sets Letter overlap so H and i merge into
one STL named 01_Hi.stl. Asserts the README includes a Pieces
section and the per-letter STLs are gone."
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Worker contract section**

In `CLAUDE.md`, find the `## Worker contract` section. Replace the line:

```
- **`LetterMesh.index` is the ORIGINAL text index, including spaces.** `PreviewCanvas` looks up letters by the index returned from `Array.from(text)`. Don't switch to a filtered (no-spaces) index — that bug previously broke `"ipsum ipsum"` and `" opsum"`.
```

with:

```
- **`ComponentMesh.members[].index` is the ORIGINAL text index, including spaces.** Each member preserves the position of its character in the source text — used by the worker to key glyph contours. Don't switch to a filtered (no-spaces) index — that bug previously broke `"ipsum ipsum"` and `" opsum"`.
- A component may contain one or more letters. Default params produce one letter per component (today's behavior). When `letterOverlap > 0` or a bridge is configured, adjacent letters merge into a single component with one merged shell, plexi, and STL.
```

Also update the "Each letter ships with a shell mesh AND a plexi mesh" line to "Each component ships with a shell mesh AND a plexi mesh" and adjust mentions of "letter" → "component" where contractually appropriate (the rest of the document is intentionally letter-oriented for the user-facing geometry concepts; only the worker contract section needs the rename).

- [ ] **Step 2: Add a Connected mode section**

After `## State`, before `## NumberField behaviour`, insert:

```
## Connected mode

`letterOverlap`, `bridgeWidth`, `bridgeHeight`, `bridgeY` (in `state/parameters.ts`) drive the merge stage. With all four at zero/default, every letter forms its own component and behavior is identical to today's per-letter STLs.

`src/geometry/merge.ts` is the heart of the feature: it translates each glyph's contours by its `xOffset`, optionally adds bridge rectangles between consecutive non-space pairs, runs union-find by `CrossSection.intersect` non-empty, and unions each connected group into one merged contour set. A single-member group with no bridges takes a fast path and skips the CrossSection round-trip.

A bridge that doesn't actually touch both endpoints (e.g. `bridgeY` outside the letters' Y range) emits a `bridge_disconnected` warning and is dropped — the component split is unchanged.

`bridgeY` defaults to `-letterHeight / 2` because letters span `Y ∈ [-letterHeight, 0]` after `flatten.ts`'s Y-flip. The default does not auto-update when `letterHeight` changes; an intentional user value is preserved.
```

- [ ] **Step 3: Update the Export format section**

In `## Export format`, replace the file tree:

```
├── stl/01_<letter>.stl …   # 3D shells
└── plexi/01_<letter>.svg … # plexi cut shapes only
```

with:

```
├── stl/01_<chars>.stl …    # 3D shells (one per connected component)
└── plexi/01_<chars>.svg …  # plexi cut shapes only
```

Add after the existing description:

```
- `<chars>` is the joined member chars per component (e.g. `BURGER` if all letters merge, `H`/`i` if they don't), sanitized to `[A-Za-z0-9_-]`. Empty/all-non-ASCII fallback is `componentNN`. The README's "Pieces" section enumerates the slots.
```

- [ ] **Step 4: Update Tests count**

In `## Tests`, the "42 Vitest unit tests" count is now stale. Run:

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Look at the test count, and update CLAUDE.md to the new number.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for connected-letters mode"
```

---

## Self-review

**Spec coverage:**
- Parameters (4 new fields, defaults, validation, persistence migration) → Task 1 ✓
- `letterOverlap` in `layoutWord` → Task 2 ✓
- Worker contract rename to Component → Task 3 ✓
- README & Pieces section, filename scheme → Task 3 (zip) + Task 4 (README) ✓
- `merge.ts` module with overlap, bridges, fast path, warnings → Task 5 ✓
- Wire merge into worker, thread original index → Task 6 ✓
- UI controls → Task 7 ✓
- Tests (unit per stage, e2e covering connected mode) → Tasks 1, 2, 3, 4, 5, 8 ✓
- Errors and warnings (offset_collapsed, bridge_disconnected, worker exception) → Task 3 (preview surfaces) + Task 5 (merge emits) ✓
- WASM lifecycle reminder → Task 5 implementation includes named intermediates and `.delete()` ✓
- CLAUDE.md update → Task 9 ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later" lines. Code blocks present in every code-step. Two known clarifications:
- Task 5 explains that the contours map is keyed by original index and references Task 6 for the `originalIndex` thread-through. This is a deliberate two-step landing, not a placeholder.
- Task 8 notes the e2e overlap value (30mm) may need tuning. This is empirical adjustment guidance, not an unresolved decision.

**Type consistency:**
- `ComponentMember` (`{ char, index }` in `worker-client.ts`) vs the merge module's `ComponentMember` (`{ char, index, xOffset }`). The worker maps merge's member shape down to the wire shape (`memberRefs = comp.members.map(m => ({ char: m.char, index: m.index }))`) — Task 6 Step 8 shows this. Consistent.
- `STLEntry` / `PlexiEntry` use `chars` (joined string) — consistent across `zip.ts`, `ExportButtons.tsx`, and `zip.test.ts` (Task 3 Step 6/7).
- `BuildResult.components` / `BuildResult.layers` / `BuildResult.errors` / `BuildResult.warnings` — used consistently in `worker-client.ts`, `ExportButtons.tsx`, `PreviewCanvas.tsx` (Task 3).
- `LayoutEntry.originalIndex` introduced in Task 6 Step 3, consumed in Task 6 Step 5 (merge.ts) and Task 6 Step 8 (worker.ts).

No inconsistencies found.

**Scope check:** This plan covers one feature (connected letters) with one user-visible change (new Connectors controls). It's appropriately scoped for a single implementation cycle.
