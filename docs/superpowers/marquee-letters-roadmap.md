# Marquee Letters — Roadmap

This is the umbrella for sub-projects that turn the lightbox letter generator into a tool for building cinema/marquee-style signs (e.g. the "BAR" image with light bulbs poking through the front face). Each sub-project gets its own spec → plan → implementation cycle. They land independently.

The reference image: copper channel letters with circular bulbs in a regular pattern around the perimeter; cables routed between adjacent letters; mounted to a wall with screws or keyholes.

## Status

| Sub-project | Status | Spec | Plan |
|---|---|---|---|
| A. Open-back / rear cavity | ✅ shipped (2026-06-10) | `specs/2026-06-10-back-cavity-design.md` | `plans/2026-06-10-back-cavity.md` |
| B. Bulb holes on front face | ⏳ next | — | — |
| C. Side-wall pass-through holes | ⏳ pending | — | — |
| D. Mounting features | ⏳ pending | — | — |

Order is sequential: B → C → D. Each builds on what came before, but each is independently shippable.

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

**Goal:** Cylindrical cable channels through the side walls of adjacent letters, aligned so a single cable can run from one letter into the next.

This is the inverse of the existing **bridges** feature: instead of adding solid material between letters (a bar that connects them), this **removes** material on each side wall (a hole that the cable passes through).

**Open design questions:**

- **Where on the side wall?** A single hole at a fixed Y per letter pair, similar to `bridgeY`, or two holes (one near the top, one near the bottom) for thicker cable bundles?
- **Hole shape.** Circular (one parameter, `cableHoleDiameter`)? Or rectangular slot (two parameters)?
- **Alignment between letter pairs.** The hole on letter A's right wall should line up with the hole on letter B's left wall. The Y position is shared. The X position is **the side wall** of each letter — but for connected/merged components there is no side wall between them, so the hole only makes sense at the **leftmost and rightmost letters' outer walls**, plus between **separate components** (and within a component, two letters are already connected via a bridge or overlap). So the hole pairs only land at component boundaries.

  Actually that's wrong on reflection — even between merged letters in the same component, you might want a cable channel through the joining region for an LED strip that runs all the way through. So the hole logic needs to think in terms of "every pair of adjacent visible letters," not "every component boundary."

- **Interaction with bridges.** If letters are bridged (sub-project: connected mode, already shipped), the bridge bar might or might not be where the cable goes. Possibly the cable hole IS through the bridge. Or possibly through the wall above/below the bridge. Probably worth letting the user place the hole independently of the bridge.

- **Open ends at the leftmost/rightmost letter.** The first letter has its left side wall facing nothing; the last letter likewise on its right. Do we put a power-entry hole there too? Probably yes — that's where the cable comes from the wall outlet.

**Likely parameters:**
- `cableHoleDiameter` (mm). 0 = disabled.
- `cableHoleY` (mm). Position on the side wall.
- `cableHoleAtEnds: boolean` — whether to also cut a hole on the leftmost letter's left wall and the rightmost letter's right wall (for power entry/exit). Default true.

**Estimated scope:** small to medium. Per letter, identify the leftmost and rightmost X of the perimeter at the chosen Y. Cut a horizontal cylinder through each side wall at that XY. Worker-side, this happens after the merge stage, on each component's individual letters. ~2–3 tasks.

---

## Sub-project D — Mounting features

**Goal:** Practical hardware to mount the letter to a wall. Works for both flat-back letters (no rear cavity) and open-back / rear-cavity letters.

**Open design questions:**

- **Mounting style.** Three plausible options:
  - **Keyhole slots** through the back panel — letter hangs on screws driven into the wall.
  - **Magnet recesses** — pockets sized for round neodymium magnets glued into the back, letter sticks to a steel plate or magnetic substrate.
  - **French cleat** — a horizontal strip on the back of the letter mates with a corresponding cleat on the wall.
  Keyholes are the most common for marquee letters; let's start with those.

- **Where do they land for flat-back letters?** Through the back panel (Z=0 to Z=`backThickness`). Punched out from the back as keyhole-shaped pockets.

- **Where do they land for open-back letters?** No back panel exists at the very back — only the internal partition (which is now Z=`backCavityDepth` to Z=`backCavityDepth + backThickness`). The keyhole slots could go through the internal partition (mount visible from the rear cavity, which is fine since the user will be screwing it from there anyway). Alternative: tabs that protrude from the rear cavity walls outward, with keyholes in the tabs — but tabs add visible hardware to the front profile.

- **Placement.** Manually positioned (X, Y per slot) or auto-placed (e.g. one slot at the top center, one at each lower corner)? Auto-placement with a count parameter (1, 2, or 4) is probably enough for v1.

- **Slot dimensions.** Keyhole = circle (screw head) + slot below it (screw shank) so the letter slides down onto the screw. Three params: `screwHeadDiameter`, `screwShankDiameter`, `slotLength`.

**Likely parameters:**
- `mountingStyle: "none" | "keyhole"` (extensible later for magnets/cleats).
- `mountCount: 1 | 2 | 4`.
- `mountScrewHeadDiameter` (mm).
- `mountScrewShankDiameter` (mm).
- `mountSlotLength` (mm).

**Estimated scope:** medium. Keyhole geometry is straightforward (circle + rectangle, subtract from back panel). Auto-placement needs to know the letter's bbox center and corners. Per-component placement (since merged components have one shared back panel). ~3 tasks.

**Hard dependency:** none — works with or without sub-project A (rear cavity). The implementation just needs to detect whether to cut through the back panel (flat-back) or through the internal partition (open-back).

---

## Combined-mode acceptance

When B + C + D ship, a user typing "BAR" with marquee defaults should get:
- Open-back letters with rear cavity (A) ✓
- Bulb holes around the front-face perimeter (B)
- Cable pass-through holes between B-A, A-R, plus power-entry holes on the outside of B and R (C)
- Two keyhole slots per letter for wall mounting (D)

The downloaded zip should still cleanly fit on a print bed and a slicer should orient it open-back-down without manual rotation.

---

## Notes

- Each sub-project should follow the same flow: brainstorm → spec → plan → subagent-driven implementation → merge.
- The `letterOverlap` and bridges (connected mode) are orthogonal and continue to work — a marquee letter can also be merged with its neighbours via overlap or bridges.
- Don't introduce a "marquee mode" toggle. The features compose individually: a user can have bulb holes without keyhole mounts, or keyholes without bulb holes, etc.
