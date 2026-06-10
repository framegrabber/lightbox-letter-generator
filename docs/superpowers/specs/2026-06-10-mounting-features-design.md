# Mounting Features (Keyhole Slots) — Design Spec

Date: 2026-06-10

Sub-project D of the marquee-letters umbrella. Spec for keyhole-style wall mounting; magnets and cleats explicitly out of scope for v1.

## Goal

Cut **two keyhole slots per component** so the user can hang each printed letter on two wall-mounted screws. Disabled by default. Works for both flat-back letters (`backCavityDepth = 0`) and open-back letters (`backCavityDepth > 0`) with one parameter set; the geometry path differs internally.

A keyhole slot has a wide round opening at the bottom (the screw head passes through) and a narrow vertical slot extending upward (the shank rides up as the letter is lowered onto the screw). After install, the screw rests at the top of the slot with its head captured behind the slot portion.

## Scope

In scope:

- Three new parameters: `mountShankDiameter`, `mountSlotY`, `mountSlotXInset`.
- Two slots per merged component, X-positioned at component bbox edges with user-set inset.
- Geometry: through-the-back-panel keyhole for flat-back; tab-hosted keyhole for open-back.
- Updates to `parameters`, `persistence`, `validate`, `shell.ts`, `worker.ts`, `worker-client.ts`, README, UI, preview deps, tests.

Out of scope:

- Magnet recesses, French cleats, threaded inserts (future sub-projects).
- Auto-detection of "slot lands in mid-air" — same trust-the-user policy as cable holes.
- Configurable count (always 2) or count-selector UI.
- User-overridable `mountHeadDiameter` or `mountSlotLength` — both derived from `mountShankDiameter`.
- Per-slot manual XY override.

## User-visible behaviour

Disabled by default (`mountShankDiameter = 0`). With the feature on:

- Each merged component gets **two** keyhole-shaped openings.
- Slots are positioned at `bbox.minX + mountSlotXInset` and `bbox.maxX − mountSlotXInset`, both at the same Y (`mountSlotY`).
- Slot orientation: **round head opening at the BOTTOM, narrow shank slot extending UPWARD** to the screw resting position.
- For flat-back letters, the keyhole goes through the back panel (Z range `[0, backThickness]`).
- For open-back letters, the keyhole is cut through a **tab** at the very rear of the letter (Z range `[0, backThickness]`). The tab fuses with the perimeter wall at `mountSlotY` by stretching in X from the slice edge to past the slot. The partition further forward stays solid; the front cavity is untouched.
- Slot X positions are derived from `xExtentAtY(mergedContours, mountSlotY)` — the X-extent of letter material at the slot's Y, not the bbox. Tapering letters (V, A) at high Y get slots on the actual wall positions.
- The keyhole is a single through-hole shaped like a stadium-with-bulb (head circle at bottom, narrow slot, small rounded top circle) cut at Z ∈ `[0, backThickness]`. No back-side pocket — earlier versions added one but it ate too much material on a typical 2 mm panel without enough mechanical benefit.
- After install, the screw shank rides through the keyhole's narrow slot and the head is captured behind the through-hole's narrow portion (in the rear cavity for open-back, in the front cavity for flat-back).

For "BAR" with `letterOverlap = 0` (3 components), the user gets 6 keyholes. For a merged "BAR" component (overlap or bridges), the user gets 2 keyholes spanning the full merged piece — slots near the outer edges of B and R, ideal for a long sign.

## Parameters

Added to `Parameters` in `src/state/parameters.ts`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `mountShankDiameter` | number (mm) | `0` | finite; `≥ 0`. **`0` disables the feature.** |
| `mountSlotY` | number (mm) | `letterHeight × 0.75` (=150 for default) | finite |
| `mountSlotXInset` | number (mm) | `2 × wallThickness` (=20 for default) | finite; `> 0` |

**Derived (computed in geometry, never stored):**

- `headDiameter = 2 × shankDiameter`
- `slotLength = 2 × shankDiameter`

A typical `mountShankDiameter = 4` (for a #6/#8 wood screw) yields head opening = 8 mm, slot length = 16 mm. Total keyhole Y extent = `slotLength + headDiameter = 24 mm`. Future scope: expose head/slot params if 2× / 4× ratios prove restrictive.

`mountSlotY` semantics: the **Y of the screw's resting position** = top of the narrow slot. The user marks the wall and drills the screws at letter-coordinate Y = `mountSlotY`. The slot extends downward from there to `mountSlotY − slotLength`; the round head opening is centered at `mountSlotY − slotLength`. Total keyhole occupies letter Y ∈ `[mountSlotY − slotLength − headDiameter/2, mountSlotY]`.

`mountSlotXInset` defaults to `2 × wallThickness` (=20 mm for default). The default does not auto-update when `wallThickness` changes; an intentional user value is preserved (same convention as `bridgeY`).

## Geometry

### New helper: `src/geometry/mounts.ts`

Pure function, mirrors `cable-holes.ts`. Imports `xExtentAtY` from `cable-holes.ts` for slice-based slot positioning. No `manifold-3d` imports.

```ts
export type MountSlot = {
  x: number;          // word-space X
  y: number;          // word-space Y of screw resting position (top of slot)
  shankDiameter: number;
  headDiameter: number;
  slotLength: number;
};

export type MountTab = {
  minX: number; maxX: number;
  minY: number; maxY: number;
  zBottom: number; zTop: number;
};

export type MountPlan = {
  slots: MountSlot[];
  tabs: MountTab[];     // empty when backCavityDepth = 0
};

export type MountParams = {
  mountShankDiameter: number;
  mountSlotY: number;
  mountSlotXInset: number;
  wallThickness: number;
  backThickness: number;
  backCavityDepth: number;
};

export function computeMounts(
  mergedContours: GlyphContours,
  params: MountParams,
): MountPlan;
```

Per-component logic:

1. If `mountShankDiameter <= 0` → return `{ slots: [], tabs: [] }`.
2. Compute `slice = xExtentAtY(mergedContours, mountSlotY)`. If null (slotY outside the contour's Y range), return `{ slots: [], tabs: [] }`.
3. Derived: `headDiameter = 2 * shank`, `slotLength = 2 * shank`.
4. Two slots:
   - `leftSlot.x = slice.minX + mountSlotXInset`
   - `rightSlot.x = slice.maxX − mountSlotXInset`
   - Both `y = mountSlotY`.
5. If `backCavityDepth = 0` → `tabs: []`.
6. If `backCavityDepth > 0` → one tab per slot, anchored to the slice edge so it fuses with the perimeter wall at slotY:
   - **Left tab:** X ∈ `[slice.minX − ε, leftSlot.x + headDiameter/2 + 2]` (where `ε = 0.01`).
   - **Right tab:** X ∈ `[rightSlot.x − headDiameter/2 − 2, slice.maxX + ε]`.
   - Y ∈ `[mountSlotY − slotLength − headDiameter/2 − 2, mountSlotY + 2]`.
   - Z ∈ `[0, backThickness]` — at the very rear of the letter, regardless of `backCavityDepth`.

The tab attaches to the perimeter wall at slotY by overlapping the slice edge. The slice gives the actual X-extent of letter material at slotY (not the bbox), so the tab is guaranteed to fuse with the wall material wherever the wall ring exists. No floating geometry results, regardless of letter shape — tapering letters (V, A) get tabs on their actual walls at the chosen Y.

### `buildLetterShell` in `src/geometry/shell.ts`

`ShellInputs` gains `mounts?: MountPlan`. Optional — when absent or both arrays empty, the new block is a no-op.

The mount-drilling block runs **after** the cable-hole drilling block (so cable cylinders pass cleanly through any tab they happen to share Z with) and before `getMesh`:

```ts
if (input.mounts && (input.mounts.slots.length > 0 || input.mounts.tabs.length > 0)) {
  const { Manifold } = m;

  // 1. UNION tabs (open-back only — flat-back has empty tabs array).
  // Each tab is clipped (intersect) against `outerPrism` first so it
  // follows the actual letter outline across its full Y range — never
  // sticks out where the outline narrows below the slot's Y.
  for (const tab of input.mounts.tabs) {
    const tabSize: [number, number, number] = [
      tab.maxX - tab.minX,
      tab.maxY - tab.minY,
      tab.zTop - tab.zBottom,
    ];
    const tabBox = Manifold.cube(tabSize, false);
    const tabPositioned = tabBox.translate([tab.minX, tab.minY, tab.zBottom]);
    const tabClipped = tabPositioned.intersect(outerPrism);
    const newShell = shell.add(tabClipped);
    tabBox.delete(); tabPositioned.delete(); tabClipped.delete();
    shell.delete();
    shell = newShell;
  }

  // 2. SUBTRACT keyhole through-holes (full panel depth, no back pocket).
  // Keyhole topology: head circle at the bottom + narrow slot rectangle +
  // small rounded top circle, so both ends of the slot are rounded.
  const keyholeHeight = input.backThickness;
  const keyholeCenterZ = input.backThickness / 2;

  for (const slot of input.mounts.slots) {
    const halfHead = slot.headDiameter / 2;
    const halfShank = slot.shankDiameter / 2;
    const headCenterY = slot.y - slot.slotLength;
    const slotMidY = slot.y - slot.slotLength / 2;

    const head = Manifold.cylinder(keyholeHeight, halfHead, halfHead, undefined, true);
    const headPos = head.translate([slot.x, headCenterY, keyholeCenterZ]);
    const slotTop = Manifold.cylinder(keyholeHeight, halfShank, halfShank, undefined, true);
    const slotTopPos = slotTop.translate([slot.x, slot.y, keyholeCenterZ]);
    const slotBox = Manifold.cube([slot.shankDiameter, slot.slotLength, keyholeHeight], true);
    const slotBoxPos = slotBox.translate([slot.x, slotMidY, keyholeCenterZ]);
    const headPlusSlot = headPos.add(slotBoxPos);
    const keyhole = headPlusSlot.add(slotTopPos);

    const newShell = shell.subtract(keyhole);
    head.delete(); headPos.delete();
    slotTop.delete(); slotTopPos.delete();
    slotBox.delete(); slotBoxPos.delete();
    headPlusSlot.delete(); keyhole.delete();
    shell.delete(); shell = newShell;
  }
}
```

`shell` is reassigned across operations the same way the cable-hole loop already does (the `let shell: typeof shellNoRear` annotation upstream covers this).

### WASM lifecycle

Every CrossSection and Manifold intermediate is `.delete()`-ed inline (CLAUDE.md WASM rule). Net new allocations per slot when active:

- `head` (CrossSection), `headPos` (CrossSection), `slotRect` (CrossSection), `keyholeXY` (CrossSection from `.add`), `keyholeExtruded` (Manifold), `keyholePositioned` (Manifold).

Per tab: `tabXY` (CrossSection), `tabExtruded` (Manifold), `tabPositioned` (Manifold).

All freed before the next iteration. The `shell` variable holds the rolling result and is reassigned + deleted across each iteration like the cable-hole loop.

## Worker contract

`worker.ts` calls `computeMounts` per component using the merged-component bbox (in word space):

```ts
import { computeMounts } from "./mounts";

// Inside the per-component loop, before buildLetterShell:
const componentMounts = computeMounts(comp.bbox, {
  mountShankDiameter: req.params.mountShankDiameter,
  mountSlotY: req.params.mountSlotY,
  mountSlotXInset: req.params.mountSlotXInset,
  wallThickness: req.params.wallThickness,
  backThickness: req.params.backThickness,
  backCavityDepth: req.params.backCavityDepth,
});

const meshResult = await buildLetterShell({
  // ... existing fields ...
  mounts:
    componentMounts.slots.length > 0
      ? componentMounts
      : undefined,
});
```

`worker-client.ts` `plainParams` adds the three fields:

```ts
mountShankDiameter: params.mountShankDiameter,
mountSlotY: params.mountSlotY,
mountSlotXInset: params.mountSlotXInset,
```

`comp.bbox` already exists on `ComponentMesh`-style intermediates from the merge stage (used for cable-hole filtering today). For single-letter components it's the letter bbox; for merged components it's the merged-contour bbox. No special-casing needed.

## Validation (`validate.ts`)

```ts
if (!Number.isFinite(p.mountShankDiameter) || p.mountShankDiameter < 0) {
  errors.push({ field: "mountShankDiameter", message: "Mount shank diameter must be ≥ 0" });
}
if (!Number.isFinite(p.mountSlotY)) {
  errors.push({ field: "mountSlotY", message: "Mount slot Y must be a finite number" });
}
if (!Number.isFinite(p.mountSlotXInset) || p.mountSlotXInset <= 0) {
  errors.push({ field: "mountSlotXInset", message: "Mount slot X inset must be > 0" });
}
```

No upper bounds. If a slot lands in mid-air (e.g. for a narrow letter where `bbox.minX + xInset` is outside the wall material at the chosen Y), the boolean is a near-no-op and the user sees no keyhole in the preview, then adjusts. Same trust-the-user policy as cable holes.

## Persistence (`persistence.ts`)

`migrate()` fills the three new fields with `typeof !== "number"` guards (preserves `0`):

```ts
if (typeof out.mountShankDiameter !== "number") {
  out.mountShankDiameter = DEFAULT_PARAMETERS.mountShankDiameter;
}
if (typeof out.mountSlotY !== "number") {
  const lh = typeof out.letterHeight === "number" ? out.letterHeight : DEFAULT_PARAMETERS.letterHeight;
  out.mountSlotY = lh * 0.75;
}
if (typeof out.mountSlotXInset !== "number") {
  const wt = typeof out.wallThickness === "number" ? out.wallThickness : DEFAULT_PARAMETERS.wallThickness;
  out.mountSlotXInset = wt * 2;
}
```

`serialize` (the `ser` literal) extended with the three fields. `ExportButtons.tsx` reproduce-URL serializable extended likewise.

## README (`buildReadme`)

Three new lines, column-aligned to the existing 19-char value column in `manifest.ts`'s lines array:

```
  Mount shank dia:   4 mm
  Mount slot Y:      150 mm
  Mount slot inset:  20 mm
```

The implementer counts spaces exactly when wiring the lines in.

## UI (`ControlsPanel.tsx`)

New "Mounting" fieldset placed between "Cable holes" and "Advanced". Three `NumberField`s:

```tsx
<NumberField
  label="Mount shank diameter"
  unit="mm"
  value={params.mountShankDiameter}
  onChange={(v) => params.set({ mountShankDiameter: v })}
  error={errorFor(errs, "mountShankDiameter")}
  step={0.5}
/>
<NumberField
  label="Mount slot Y"
  unit="mm"
  value={params.mountSlotY}
  onChange={(v) => params.set({ mountSlotY: v })}
  error={errorFor(errs, "mountSlotY")}
  step={1}
/>
<NumberField
  label="Mount slot X inset"
  unit="mm"
  value={params.mountSlotXInset}
  onChange={(v) => params.set({ mountSlotXInset: v })}
  error={errorFor(errs, "mountSlotXInset")}
  step={1}
/>
```

`step={0.5}` for the diameter (small adjustments matter for screw fit); `step={1}` for the placement params.

## Preview (`usePreviewBuild.ts`)

The useEffect dependency array gains the three new fields. Without this, the preview won't rebuild when mount params change. (Same bug-pattern as the c8ffd1c regression that was caught for cable holes.)

## Export

No filename, folder, or zip-layout changes. The shell mesh has additional features — `meshToBinarySTL` serializes whatever's there.

The reproduce URL gains the three fields.

## Tests

New `tests/unit/geometry/mounts.test.ts`:

- `mountShankDiameter = 0` → `{ slots: [], tabs: [] }`.
- Two slots emitted at `bbox.minX + xInset` and `bbox.maxX - xInset`, both at `mountSlotY`.
- Derived `headDiameter = 2 × shank` and `slotLength = 2 × shank` exposed on each `MountSlot`.
- `backCavityDepth = 0` → `tabs.length === 0`.
- `backCavityDepth > 0` → `tabs.length === 2`. Each tab is `(headDiameter + 4) × (slotLength + headDiameter + 4)` mm, centered on its slot's X and bracketing the keyhole's Y.
- Tab Z range = `[max(0, backCavityDepth - backThickness), backCavityDepth]`. Test the clamp: `backCavityDepth = 1, backThickness = 2 → zBottom = 0`.

Extending `tests/unit/geometry/shell.test.ts`:

- With mounts and `backCavityDepth = 0`, mesh has reduced volume vs without.
- With mounts and `backCavityDepth > 0`, mesh has greater volume than without mounts (tabs added) but with the keyhole openings cut through.

`tests/unit/state/parameters.test.ts` — defaults assertion gains the three new fields.

`tests/unit/state/persistence.test.ts`:

- `migrate()` fills defaults for missing mount fields.
- Preserves `0`, including `mountShankDiameter: 0`.
- Re-derives `mountSlotY` from saved `letterHeight` if missing.
- Re-derives `mountSlotXInset` from saved `wallThickness` if missing.

`tests/unit/geometry/validate.test.ts`:

- Accepts `mountShankDiameter = 0` (disabled).
- Rejects negative shank.
- Rejects NaN on each field.
- Rejects `mountSlotXInset <= 0`.

`tests/unit/exporters/manifest.test.ts` — README contains the three new lines.

`tests/e2e/smoke.spec.ts` — no assertion changes; explicit zero values added to the test's params object so behavior is independent of defaults.

## Files touched

**Created:**

- `src/geometry/mounts.ts`
- `tests/unit/geometry/mounts.test.ts`

**Modified:**

- `src/state/parameters.ts` — three new fields, defaults
- `src/state/persistence.ts` — migrate + serialize
- `src/geometry/validate.ts` — bounds
- `src/geometry/shell.ts` — `ShellInputs.mounts`, tab-union + keyhole-subtract block (after cable holes)
- `src/geometry/worker.ts` — compute & pass mounts per component
- `src/geometry/worker-client.ts` — `plainParams` literal
- `src/ui/ControlsPanel.tsx` — new "Mounting" fieldset
- `src/ui/ExportButtons.tsx` — reproduce-URL serializable
- `src/ui/usePreviewBuild.ts` — three new deps
- `src/exporters/manifest.ts` — three README lines
- `CLAUDE.md` — new "Mounting" section, spec list, test count
- Existing test files — defaults / migration / validate / manifest / shell / smoke
- `docs/superpowers/marquee-letters-roadmap.md` — mark sub-project D as shipped (post-merge)

## Acceptance

- `mountShankDiameter = 0` produces byte-equivalent geometry to today's output (feature off).
- With `mountShankDiameter = 4, mountSlotY = 150, mountSlotXInset = 20`:
  - Flat-back letter: each component has 2 keyhole through-holes in its back panel (round opening at the bottom, slot extending upward to the screw resting Y).
  - Open-back letter: each component has 2 tabs hanging from the partition into the rear cavity (one per slot), each with a keyhole through it. The partition itself stays solid above; the front cavity is untouched.
- Reproduce URL round-trips all three new fields.
- Saved parameters from before this change continue to load (migration fills defaults).
- All existing unit tests still pass (with explicit zeros added to fixtures where required to keep typecheck green).
- New unit tests pass.
- E2E continues to pass.
- `npm run build` clean.
