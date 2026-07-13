# Uploaded Font Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a registry of all uploaded fonts in IndexedDB so users can switch between previously uploaded fonts (and remove them) without re-uploading.

**Architecture:** The font *bytes* already persist in the idb-keyval store under `font:<sha256>`. This plan adds a `font-index` key in the same store holding `UploadedFontMeta[]` (`{sha256, name, addedAt}`), three registry functions in `src/fonts/cache.ts`, and a `FontPicker` that lists the registry in an "Uploaded" `<optgroup>` with a Remove button. No changes to `parameters.ts`, `persistence.ts`, the worker, or exporters — the `fontSource` shape is untouched.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax` — use `import type`), React 19, zustand, idb-keyval, Vitest + @testing-library/react (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-13-uploaded-font-library-design.md`

## Global Constraints

- `verbatimModuleSyntax` is on: type-only imports MUST use `import type { ... }`.
- Run `npm test` and `npm run lint` after substantive changes.
- Unit tests mirror `src/` layout under `tests/unit/`.
- Test fixture font: `tests/fixtures/fonts/Inter-Regular.ttf`.
- Default font is bundled Anton: `{ kind: "bundled", id: "anton" }` (also available as `DEFAULT_PARAMETERS.fontSource` from `src/state/parameters.ts`).
- `getCachedFont` is consumed by `src/ui/usePreviewBuild.ts` — its signature must not change.

---

### Task 1: Registry functions in `src/fonts/cache.ts`

**Files:**
- Modify: `src/fonts/cache.ts`
- Test: `tests/unit/fonts/cache.test.ts` (new)

**Interfaces:**
- Consumes: `get`, `set`, `del` from `idb-keyval` (already a dependency).
- Produces (Task 2 relies on these exact signatures):
  - `export type UploadedFontMeta = { sha256: string; name: string; addedAt: number }`
  - `listUploadedFonts(): Promise<UploadedFontMeta[]>` — returns `[]` when the index is absent.
  - `registerUploadedFont(meta: UploadedFontMeta, buffer?: ArrayBuffer): Promise<void>` — writes bytes under `font:<sha256>` when `buffer` is given (omitted for adopting pre-index uploads whose bytes already exist), then upserts the index row deduped by `sha256`.
  - `removeUploadedFont(sha256: string): Promise<void>` — deletes both the byte entry and the index row.
  - `getCachedFont(sha256)` is kept unchanged. `cacheFont` and `deleteCachedFont` are deleted in Task 2 once their last caller is migrated.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/fonts/cache.test.ts`. Mock `idb-keyval` with an in-memory Map (no existing `vi.mock` pattern in the repo yet; this is the canonical Vitest hoisted-mock form):

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  listUploadedFonts,
  registerUploadedFont,
  removeUploadedFont,
  getCachedFont,
} from "../../../src/fonts/cache";

const bufA = new Uint8Array([1, 2, 3]).buffer;
const bufB = new Uint8Array([4, 5, 6]).buffer;

describe("uploaded font registry", () => {
  beforeEach(() => {
    store.clear();
  });

  it("lists empty when no index exists", async () => {
    expect(await listUploadedFonts()).toEqual([]);
  });

  it("registers a font: bytes stored, index row added", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    expect(await getCachedFont("aaa")).toBe(bufA);
    expect(await listUploadedFonts()).toEqual([{ sha256: "aaa", name: "A.ttf", addedAt: 1 }]);
  });

  it("dedupes by sha256: re-registering refreshes the row, keeps one entry", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    await registerUploadedFont({ sha256: "bbb", name: "B.ttf", addedAt: 2 }, bufB);
    await registerUploadedFont({ sha256: "aaa", name: "A-renamed.ttf", addedAt: 3 }, bufA);
    const list = await listUploadedFonts();
    expect(list).toHaveLength(2);
    expect(list.find((f) => f.sha256 === "aaa")?.name).toBe("A-renamed.ttf");
  });

  it("registers without a buffer (adoption): index row only, bytes untouched", async () => {
    await registerUploadedFont({ sha256: "ccc", name: "C.ttf", addedAt: 1 });
    expect(await listUploadedFonts()).toEqual([{ sha256: "ccc", name: "C.ttf", addedAt: 1 }]);
    expect(await getCachedFont("ccc")).toBeUndefined();
  });

  it("removes a font: bytes and index row both gone, others untouched", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    await registerUploadedFont({ sha256: "bbb", name: "B.ttf", addedAt: 2 }, bufB);
    await removeUploadedFont("aaa");
    expect(await getCachedFont("aaa")).toBeUndefined();
    expect(await getCachedFont("bbb")).toBe(bufB);
    expect(await listUploadedFonts()).toEqual([{ sha256: "bbb", name: "B.ttf", addedAt: 2 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/fonts/cache.test.ts`
Expected: FAIL — `listUploadedFonts` (etc.) are not exported from `src/fonts/cache.ts`.

- [ ] **Step 3: Implement the registry in `src/fonts/cache.ts`**

Replace the file contents with:

```ts
import { get, set, del } from "idb-keyval";

const PREFIX = "font:";
const INDEX_KEY = "font-index";

export type UploadedFontMeta = {
  sha256: string;
  name: string; // original filename
  addedAt: number; // Date.now() at registration
};

export async function getCachedFont(sha256: string): Promise<ArrayBuffer | undefined> {
  return await get(PREFIX + sha256);
}

export async function listUploadedFonts(): Promise<UploadedFontMeta[]> {
  return (await get(INDEX_KEY)) ?? [];
}

export async function registerUploadedFont(
  meta: UploadedFontMeta,
  buffer?: ArrayBuffer,
): Promise<void> {
  if (buffer) {
    await set(PREFIX + meta.sha256, buffer);
  }
  const rest = (await listUploadedFonts()).filter((f) => f.sha256 !== meta.sha256);
  await set(INDEX_KEY, [...rest, meta]);
}

export async function removeUploadedFont(sha256: string): Promise<void> {
  await del(PREFIX + sha256);
  const rest = (await listUploadedFonts()).filter((f) => f.sha256 !== sha256);
  await set(INDEX_KEY, rest);
}

// Still imported by FontPicker.tsx until Task 2 migrates it to
// registerUploadedFont; deleted there.
export async function cacheFont(sha256: string, buffer: ArrayBuffer): Promise<void> {
  await set(PREFIX + sha256, buffer);
}
```

`deleteCachedFont` is dropped in this rewrite — nothing imports it. `cacheFont` stays temporarily so the build remains green between tasks; Task 2 deletes it after migrating its only caller.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/fonts/cache.test.ts`
Expected: PASS (5 tests).

Also run the full suite to catch regressions: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/fonts/cache.ts tests/unit/fonts/cache.test.ts
git commit -m "feat(fonts): persistent uploaded-font registry in IndexedDB"
```

---

### Task 2: FontPicker lists, switches, and removes uploaded fonts

**Files:**
- Modify: `src/ui/FontPicker.tsx`
- Modify: `src/fonts/cache.ts` (delete now-unused `cacheFont`)
- Test: `tests/unit/ui/FontPicker.test.tsx` (new)

**Interfaces:**
- Consumes from Task 1: `listUploadedFonts()`, `registerUploadedFont(meta, buffer?)`, `removeUploadedFont(sha256)`, `type UploadedFontMeta`.
- Consumes: `useParameters` zustand store (`fontSource`, `set`), `DEFAULT_PARAMETERS.fontSource` from `src/state/parameters.ts`, `BUNDLED_FONTS`, `sha256OfBuffer`, `parseFontBuffer`.
- Produces: the `<select id="font">` now contains `<optgroup label="Bundled">` and (when non-empty) `<optgroup label="Uploaded">`; uploaded `<option>` values are the sha256. A button with accessible name `Remove uploaded font` appears while an uploaded font is selected. Task 3's e2e relies on these exact labels.

- [ ] **Step 1: Write the failing component tests**

Create `tests/unit/ui/FontPicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const registry = new Map<string, { sha256: string; name: string; addedAt: number }>();

vi.mock("../../../src/fonts/cache", () => ({
  listUploadedFonts: vi.fn(async () => [...registry.values()]),
  registerUploadedFont: vi.fn(
    async (meta: { sha256: string; name: string; addedAt: number }) => {
      registry.set(meta.sha256, meta);
    },
  ),
  removeUploadedFont: vi.fn(async (sha256: string) => {
    registry.delete(sha256);
  }),
  getCachedFont: vi.fn(async () => undefined),
}));

import { FontPicker } from "../../../src/ui/FontPicker";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";
import { registerUploadedFont } from "../../../src/fonts/cache";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

describe("FontPicker uploaded-font library", () => {
  beforeEach(() => {
    registry.clear();
    vi.clearAllMocks();
    useParameters.setState({ ...DEFAULT_PARAMETERS });
  });

  it("lists registered uploads in an Uploaded optgroup", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    registry.set(SHA_B, { sha256: SHA_B, name: "Other.otf", addedAt: 2 });
    render(<FontPicker />);
    expect(await screen.findByRole("group", { name: "Uploaded" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "MyFont.ttf" })).toHaveValue(SHA_A);
    expect(screen.getByRole("option", { name: "Other.otf" })).toHaveValue(SHA_B);
  });

  it("hides the Uploaded optgroup when the registry is empty", async () => {
    render(<FontPicker />);
    // Wait for the mount-effect load to settle, then assert absence.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Uploaded" })).not.toBeInTheDocument(),
    );
  });

  it("selecting an uploaded option sets fontSource", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    render(<FontPicker />);
    await screen.findByRole("option", { name: "MyFont.ttf" });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: SHA_A } });
    expect(useParameters.getState().fontSource).toEqual({
      kind: "uploaded",
      name: "MyFont.ttf",
      sha256: SHA_A,
    });
  });

  it("selecting a bundled option sets bundled fontSource", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    useParameters.setState({ fontSource: { kind: "uploaded", name: "MyFont.ttf", sha256: SHA_A } });
    render(<FontPicker />);
    await screen.findByRole("option", { name: "MyFont.ttf" });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "inter" } });
    expect(useParameters.getState().fontSource).toEqual({ kind: "bundled", id: "inter" });
  });

  it("Remove deletes the selected upload and falls back to the default font", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    useParameters.setState({ fontSource: { kind: "uploaded", name: "MyFont.ttf", sha256: SHA_A } });
    render(<FontPicker />);
    const removeBtn = await screen.findByRole("button", { name: "Remove uploaded font" });
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(useParameters.getState().fontSource).toEqual(DEFAULT_PARAMETERS.fontSource),
    );
    expect(screen.queryByRole("option", { name: "MyFont.ttf" })).not.toBeInTheDocument();
  });

  it("shows no Remove button while a bundled font is selected", async () => {
    render(<FontPicker />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove uploaded font" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("adopts a selected pre-index upload into the registry on mount", async () => {
    // Selected uploaded font whose sha is NOT in the registry (upload predates the index).
    useParameters.setState({ fontSource: { kind: "uploaded", name: "Old.ttf", sha256: SHA_B } });
    render(<FontPicker />);
    await waitFor(() => expect(registerUploadedFont).toHaveBeenCalled());
    expect(registerUploadedFont).toHaveBeenCalledWith(
      expect.objectContaining({ sha256: SHA_B, name: "Old.ttf" }),
    );
    expect(await screen.findByRole("option", { name: "Old.ttf" })).toHaveValue(SHA_B);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ui/FontPicker.test.tsx`
Expected: FAIL — no `group` role "Uploaded", no Remove button, adoption never happens.

- [ ] **Step 3: Rewrite `src/ui/FontPicker.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { useParameters, DEFAULT_PARAMETERS } from "../state/parameters";
import { BUNDLED_FONTS } from "../fonts/bundled";
import { sha256OfBuffer, parseFontBuffer } from "../fonts/load";
import {
  listUploadedFonts,
  registerUploadedFont,
  removeUploadedFont,
} from "../fonts/cache";
import type { UploadedFontMeta } from "../fonts/cache";

export function FontPicker() {
  const fontSource = useParameters((s) => s.fontSource);
  const set = useParameters((s) => s.set);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedFontMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let list = await listUploadedFonts();
        // Adopt a selected upload that predates the registry so it isn't lost.
        const src = useParameters.getState().fontSource;
        if (src.kind === "uploaded" && !list.some((f) => f.sha256 === src.sha256)) {
          await registerUploadedFont({ sha256: src.sha256, name: src.name, addedAt: Date.now() });
          list = await listUploadedFonts();
        }
        if (!cancelled) setUploads(list);
      } catch {
        // IndexedDB unavailable — bundled fonts still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(file: File) {
    const buf = await file.arrayBuffer();
    try {
      await parseFontBuffer(buf);
    } catch (err) {
      alert(`Could not parse font: ${(err as Error).message}`);
      return;
    }
    const sha = await sha256OfBuffer(buf);
    await registerUploadedFont({ sha256: sha, name: file.name, addedAt: Date.now() }, buf);
    setUploads(await listUploadedFonts());
    set({ fontSource: { kind: "uploaded", name: file.name, sha256: sha } });
  }

  async function handleRemove(sha256: string) {
    await removeUploadedFont(sha256);
    setUploads(await listUploadedFonts());
    set({ fontSource: DEFAULT_PARAMETERS.fontSource });
  }

  const selectedSha = fontSource.kind === "uploaded" ? fontSource.sha256 : null;
  const selectedUnlisted =
    selectedSha !== null && !uploads.some((f) => f.sha256 === selectedSha);

  return (
    <div className="font-picker">
      <label htmlFor="font">Font</label>
      <select
        id="font"
        value={fontSource.kind === "bundled" ? fontSource.id : fontSource.sha256}
        onChange={(e) => {
          const v = e.target.value;
          const up = uploads.find((f) => f.sha256 === v);
          if (up) {
            set({ fontSource: { kind: "uploaded", name: up.name, sha256: up.sha256 } });
          } else {
            set({ fontSource: { kind: "bundled", id: v } });
          }
        }}
      >
        <optgroup label="Bundled">
          {BUNDLED_FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </optgroup>
        {(uploads.length > 0 || selectedUnlisted) && (
          <optgroup label="Uploaded">
            {uploads.map((f) => (
              <option key={f.sha256} value={f.sha256}>{f.name}</option>
            ))}
            {selectedUnlisted && fontSource.kind === "uploaded" && (
              <option value={fontSource.sha256}>{fontSource.name}</option>
            )}
          </optgroup>
        )}
      </select>
      {selectedSha !== null && (
        <button
          type="button"
          aria-label="Remove uploaded font"
          title="Remove uploaded font"
          onClick={() => void handleRemove(selectedSha)}
        >
          Remove
        </button>
      )}
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
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

Notes:
- The `selectedUnlisted` fallback option keeps the `<select>` value valid during the brief window before the mount effect populates `uploads` (and adopts pre-index uploads).
- `e.target.value = ""` resets the file input so re-selecting the same file fires `change` again.
- With `FontPicker` migrated off `cacheFont`, delete the `cacheFont` function from `src/fonts/cache.ts` (kept temporarily in Task 1 Step 3).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ui/FontPicker.test.tsx tests/unit/fonts/cache.test.ts`
Expected: PASS.

Then: `npm test` and `npm run lint`
Expected: all pass, no lint errors (watch for `import type` violations).

- [ ] **Step 5: Commit**

```bash
git add src/ui/FontPicker.tsx src/fonts/cache.ts tests/unit/ui/FontPicker.test.tsx
git commit -m "feat(ui): font picker lists persistent uploaded fonts with remove"
```

---

### Task 3: E2E — upload, switch away and back, remove

**Files:**
- Test: `tests/e2e/fonts.spec.ts` (new)

**Interfaces:**
- Consumes: the DOM contract from Task 2 (`<select id="font">` labeled "Font", optgroup "Uploaded", option text = filename, option value = sha256, button "Remove uploaded font") and the fixture `tests/fixtures/fonts/Inter-Regular.ttf`.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/fonts.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const FIXTURE = resolve(__dirname, "../fixtures/fonts/Inter-Regular.ttf");

test("uploaded fonts persist in the picker and can be removed", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Text").fill("Hi");

  const select = page.getByLabel("Font");

  // Upload: setInputFiles works on the hidden file input directly.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  // The uploaded font is selected and listed under the Uploaded optgroup.
  const uploadedOption = page.locator('optgroup[label="Uploaded"] option', {
    hasText: "Inter-Regular.ttf",
  });
  await expect(uploadedOption).toHaveCount(1);
  await expect(select).toHaveValue(/^[0-9a-f]{64}$/);

  // Switch to a bundled font — the upload stays in the list.
  await select.selectOption("anton");
  await expect(select).toHaveValue("anton");
  await expect(uploadedOption).toHaveCount(1);

  // Switch back WITHOUT re-uploading.
  const sha = await uploadedOption.getAttribute("value");
  await select.selectOption(sha!);
  await expect(select).toHaveValue(sha!);

  // Survives a reload (registry + bytes live in IndexedDB).
  await page.reload();
  await expect(page.locator('optgroup[label="Uploaded"] option')).toHaveCount(1);
  await expect(page.getByLabel("Font")).toHaveValue(sha!);

  // Remove: falls back to the default bundled font, option disappears.
  await page.getByRole("button", { name: "Remove uploaded font" }).click();
  await expect(page.getByLabel("Font")).toHaveValue("anton");
  await expect(page.locator('optgroup[label="Uploaded"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e`
Expected: the new test passes along with the existing smoke tests. (If Chromium is missing: `npx playwright install chromium` once.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fonts.spec.ts
git commit -m "test(e2e): uploaded font library — switch back and remove without re-upload"
```

---

### Task 4: Final verification and docs

**Files:**
- Modify: `CLAUDE.md` (the `src/fonts/` bullet in Layout, and the spec list)

**Interfaces:** none new.

- [ ] **Step 1: Full verification**

Run: `npm test && npm run lint && npm run e2e && npm run build`
Expected: everything green.

- [ ] **Step 2: Update CLAUDE.md**

In the Layout section, change the `src/fonts/` bullet to mention the registry:

```markdown
- `src/fonts/` — bundled font registry, opentype loader, IndexedDB cache for uploaded fonts (`font:<sha256>` byte entries + a `font-index` registry of `{sha256, name, addedAt}` so uploads persist in the picker and can be removed).
```

In the "Spec / plan" section, add:

```markdown
- Uploaded-font-library feature spec: `docs/superpowers/specs/2026-07-13-uploaded-font-library-design.md` (current with code).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: uploaded font library in CLAUDE.md"
```
