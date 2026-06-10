# Marquee Letters — Roadmap

This is the umbrella for sub-projects that turn the lightbox letter generator into a tool for building cinema/marquee-style signs (e.g. the "BAR" image with light bulbs poking through the front face). Each sub-project gets its own spec → plan → implementation cycle. They land independently.

The reference image: copper channel letters with circular bulbs in a regular pattern around the perimeter; cables routed between adjacent letters; mounted to a wall with screws or keyholes.

## Status

| Sub-project | Status | Spec | Plan |
|---|---|---|---|
| A. Open-back / rear cavity | ✅ shipped (2026-06-10) | `specs/2026-06-10-back-cavity-design.md` | `plans/2026-06-10-back-cavity.md` |
| C. Side-wall pass-through holes | ✅ shipped (2026-06-10) | `specs/2026-06-10-cable-holes-design.md` | `plans/2026-06-10-cable-holes.md` |
| D. Mounting features | ✅ shipped (2026-06-11) | `specs/2026-06-10-mounting-features-design.md` | `plans/2026-06-10-mounting-features.md` |
| B. Bulb holes on front face | ⏳ next | — | — |

Original sequential order was B → C → D. C and D shipped first by user request; B remains.

---

## Sub-project B — Bulb holes on the front face

**Goal:** A regular pattern of circular cutouts through the front face for socketed bulbs (the marquee aesthetic).

**Open design questions** to resolve when brainstorming:

- **Pattern definition.** Two extremes: (a) a fixed bulb count that auto-distributes around the letter perimeter; (b) a fixed bulb spacing in mm and the count emerges from the perimeter length. (b) is more controllable for real signage — every bulb is the same distance from its neighbour. (a) is friendlier to dial in. Probably ship (b) and let the count auto-emerge.
- **Path the bulbs follow.** Does the user want bulbs along the **outer outline** of the letter (matching the BAR image), the **inner outline** (a step inward), or a **centerline** (skeleton)? Outer outline is the marquee classic. Inner offset (e.g. `outer.offset(-bulbInset)`) might be needed so the bulb hole's edge stays a comfortable distance from the outer wall edge.
- **Hole geometry.** Just a circular hole through the front face? Or a stepped hole (smaller from the front, larger from the inside) so a bulb socket can clip in? Stepped is more realistic for E10/E12 sockets but adds 1–2 parameters (socket diameter + flange diameter + flange depth).
- **Socket compatibility.** The user might want presets for common bulb-socket sizes (E10 = 12mm hole, E12 = 14mm, etc.). YAGNI for v1; just expose `bulbHoleDiameter` and let the user pick.
- **Plexi interaction.** With bulb holes on the front face, does the front rabbet/plexi still make sense? Likely no — bulb-hole letters typically have a solid copper or steel front. So this sub-project probably needs a **"front style" toggle**: `plexi-rabbet` (today) vs `bulb-holes-no-plexi`. The plexi STL/SVG export becomes optional for that mode.
- **Rear cavity interaction.** Rear cavity is required for bulb wiring. Sub-project A is therefore a hard prereq (already done).

**Likely parameters:**
- `frontStyle: "plexi-rabbet" | "bulb-holes"` (toggle).
- `bulbCount` or `bulbSpacing` (one of, mm).
- `bulbHoleDiameter` (mm).
- `bulbInset` (mm) — how far inward from the outer outline the bulb path runs.

**Estimated scope:** medium. New geometry helper that computes equally-spaced points along a polyline. Subtract a circle at each point through the front face. Probably ~3–4 implementation tasks.

---

## Sub-project C — Side-wall pass-through holes between letters

✅ **Shipped 2026-06-10.** Spec: `docs/superpowers/specs/2026-06-10-cable-holes-design.md`. Plan: `docs/superpowers/plans/2026-06-10-cable-holes.md`.

Final shape: 4 parameters (`cableHoleDiameter`, `cableHoleY`, `cableHoleZ`, `cableHoleAtEnds`); single circular hole per adjacent non-space letter pair (same adjacency rule as bridges — spaces break the cable channel); optional power-entry cylinders on the leftmost-left and rightmost-right outer walls. Hole X is positioned by the glyph's X-extent at `cableHoleY` (slice, not bbox) so tapering letters like V/U/A get holes in the actual wall material at the chosen height. Cylinder pierces the bridge bar if a bridge happens to share Y/Z — no special-casing.

---

## Sub-project D — Mounting features

✅ **Shipped 2026-06-11.** Spec: `docs/superpowers/specs/2026-06-10-mounting-features-design.md`. Plan: `docs/superpowers/plans/2026-06-10-mounting-features.md`.

Final shape: 3 parameters (`mountShankDiameter`, `mountSlotY`, `mountSlotXInset`), with `headDiameter = 2 × shank` and `slotLength = 2 × shank` derived. Two keyhole slots per component, one near each side of the merged outline. Slot X positions are derived from `xExtentAtY(mergedContours, mountSlotY)` (slice, not bbox) so tapering letters (V, A) get slots on the actual wall material at the chosen height. Both flat-back and open-back letters use the same parameter set; for open-back, a tab fills the gap at the open rear (Z ∈ `[0, backThickness]`) and is `intersect`-clipped to the letter outline so it follows the actual letter shape across its full Y range. Keyhole shape: head circle at the bottom + narrow slot box + small rounded top circle (stadium-with-bulb). Magnet recesses, French cleats, and threaded inserts remain future scope.

---

## Combined-mode acceptance

When B ships, a user typing "BAR" with marquee defaults should get:
- Open-back letters with rear cavity (A) ✓
- Cable pass-through holes between B-A, A-R, plus power-entry holes on the outside of B and R (C) ✓
- Two keyhole slots per letter for wall mounting (D) ✓
- Bulb holes around the front-face perimeter (B)

The downloaded zip should still cleanly fit on a print bed and a slicer should orient it open-back-down without manual rotation.

---

## Notes

- Each sub-project should follow the same flow: brainstorm → spec → plan → subagent-driven implementation → merge.
- The `letterOverlap` and bridges (connected mode) are orthogonal and continue to work — a marquee letter can also be merged with its neighbours via overlap or bridges.
- Don't introduce a "marquee mode" toggle. The features compose individually: a user can have bulb holes without keyhole mounts, or keyholes without bulb holes, etc.
