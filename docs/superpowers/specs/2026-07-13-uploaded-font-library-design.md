# Uploaded Font Library — Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

Uploaded font bytes already persist in IndexedDB (`font:<sha256>` entries via idb-keyval), and the selected `fontSource` survives reloads via localStorage. But only the *currently selected* uploaded font appears in the font picker. Switching to a bundled font or uploading a second file drops the previous upload from the list — its bytes remain in IndexedDB, but nothing remembers its name/hash to offer it again. Users must re-upload a font every time they want to switch back to it.

## Goal

Keep a persistent registry of all uploaded fonts and list them in the picker, so users can switch between previously uploaded fonts without re-uploading. Include the ability to remove fonts from the registry.

## Design

### Data model & storage

- Existing `font:<sha256>` byte entries in the idb-keyval store stay unchanged.
- A new `font-index` key in the same store holds `UploadedFontMeta[]`:

  ```ts
  type UploadedFontMeta = {
    sha256: string;
    name: string;    // original filename
    addedAt: number; // Date.now() at registration
  };
  ```

- New functions in `src/fonts/cache.ts`:
  - `listUploadedFonts(): Promise<UploadedFontMeta[]>` — reads `font-index`, returns `[]` when absent.
  - `registerUploadedFont(meta, buffer): Promise<void>` — writes the bytes under `font:<sha256>` and upserts the index row (deduped by `sha256`; re-registering the same hash refreshes the name and keeps a single entry).
  - `removeUploadedFont(sha256): Promise<void>` — deletes the byte entry and the index row.
- **Adoption of pre-feature uploads:** if the persisted `fontSource` is `kind: "uploaded"` but its sha256 is missing from the index (upload predates this feature), `FontPicker` registers it into the index on mount so it isn't lost.

### UI (`src/ui/FontPicker.tsx`)

- Local state `uploads: UploadedFontMeta[]`, loaded from the index on mount and refreshed after every upload/delete.
- The dropdown renders two `<optgroup>`s: **Bundled** and **Uploaded** (the latter only when non-empty). Uploaded options are keyed and valued by `sha256`; selecting one sets `fontSource: { kind: "uploaded", name, sha256 }`.
- A **Remove** button appears while an uploaded font is selected. Clicking it deletes the font (bytes + index row), refreshes the list, and resets `fontSource` to the default bundled font (Anton).
- The upload flow is unchanged except it calls `registerUploadedFont` instead of bare `cacheFont`. Re-uploading an identical file upserts (one entry, refreshed name) and selects it.

### Error handling

- IndexedDB read failure on mount → the uploaded group is empty; the picker still works for bundled fonts (no crash).
- Selecting an uploaded font whose bytes are gone (site data cleared mid-session) surfaces through the existing build-error path in `usePreviewBuild`; no new handling.

### Out of scope

- No changes to `parameters.ts`, `persistence.ts`, the worker, or exporters — the `fontSource` shape is untouched.
- Share-URL behavior for uploaded fonts is unchanged: a URL referencing an uploaded font only works in a browser that has the bytes cached (existing limitation).
- No rename UI; the entry keeps the uploaded filename.

## Testing

- Unit tests for `listUploadedFonts` / `registerUploadedFont` / `removeUploadedFont`, including dedupe-by-hash and remove semantics (idb-keyval mocked, following the existing test patterns).
- E2E: upload a font → it appears in the Uploaded group → switch to a bundled font → switch back to the uploaded font without re-uploading → remove it → it disappears and the selection falls back to Anton.
