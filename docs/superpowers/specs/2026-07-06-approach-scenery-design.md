# Design: Approach Sequence & Dense Fortress Scenery

**Date:** 2026-07-06
**Status:** Approved
**Goal:** Two arcade-authenticity gaps from the Zaxxon comparison review: (6) the playable
approach/exit sequence over open space with perimeter walls, and (7) dense fortress scenery
on both flanks of the corridor.

## Context

The clone already has the load-bearing pieces: a starfield sky that renders wherever
`hasFloor` is false, a floating-platform cliff face and decorative apron on the *left* side
of the corridor (`renderer.ts` `drawFloor`), five scenery sprites (`hangar`, `tower`,
`silo`, `antenna`, `bunker`) hash-scattered at one per 60 y-units, and a phase state
machine keyed off `localY = cameraY - loopN * PHASE3_END` (`phases.ts`).

Real constants that govern this design (SPECS.md sample values do NOT govern — see design
doc v1.1 precedent): `SCROLL_SPEED = 30` y-units/sec base tier, `PHASE1_END = 2000`,
`PHASE2_END = 2800`, `PHASE3_END = 3600`, `BOSS_Y = 3500`, player z clamp `[8, 90]`,
ship spawn `z = 50`.

## Feature 6 — Playable approach & exit sequences

The original opens with live gameplay over open space; the fortress perimeter wall scrolls
in and you climb over it to enter. Each fortress section also exits over a wall.

### Phase change

Add an `approach` phase name to `phases.ts`:

- `localY < APPROACH_END` (new constant, `APPROACH_END = 150`) → `name: 'approach'`,
  `hasFloor: false`. At base scroll that is ~5 seconds of open-space flight.
- `hasFloor` rule becomes `name !== 'space' && name !== 'approach'`.
- Negative `localY` (the brief window right after a boss loop rebase, where
  `cameraY - (loopN+1) * PHASE3_END < 0`) falls into `approach` naturally — each new tier
  therefore opens by flying out of the previous fortress over space toward the next
  perimeter wall. No extra loop code.
- Fuel drains normally during approach (it drains during the space phase too; only the
  boss freezes fuel). The end-of-phase fuel bonus fires on the `approach → fortress1`
  transition exactly as it does for other transitions — no special case.

### Level data (`level1.json`)

Three full-span, slot-free perimeter walls:

| Wall | y | height | Role |
|---|---|---|---|
| Entry, fortress 1 | 170 | 25 | The iconic opening climb-over |
| Exit, fortress 1 | 1980 | 25 | Fly out over the wall as the floor drops into space |
| Entry, fortress 2 | 2820 | 25 | Climb back in for the boss fortress |

Height 25 clears comfortably from spawn `z = 50` but kills a player who dives early.
They get altimeter ticks and leading-face stripes for free via the existing
`wallHeights` rebuild in `game.ts`.

Relocate the two opening fuel drums (currently y=120 and y=140) to past the entry wall
(y ≥ 190) so no entity floats in open space.

Walls are ordinary segments, so `spawner.reset(baseY)` rebases them per loop and the
approach + entry wall recurs every tier. (Known pre-existing quirk, out of scope: static
`floorGaps` do not rebase per loop; this design does not use floorGaps.)

## Feature 7 — Dense fortress scenery

All decorative work stays on the aprons, outside the 0–100 play lane. Non-colliding
scenery inside the corridor would violate the readability pillar (things that look solid
must be solid).

### Right-side apron + cliff (renderer.ts `drawFloor`)

Mirror the left side: apron tiles at x ∈ [100, 120] and a right-hand cliff face + lit rim
at the x=120 edge, so the platform reads as floating in space from both sides. Same tile
palette and 10-unit slicing as the left apron.

### Densify scenery placement (renderer.ts sorted pass)

- Scatter on **both** aprons, spacing tightened from one per 60 y-units to one *cluster*
  per ~30 y-units per side, deterministic via the existing `hash()` (no RNG in render).
- Clusters: 1–2 sprites drawn adjacently (e.g. hangar+silo, tower+antenna), chosen by
  hash so composition varies along the run.
- Two new atlas sprites in the existing pixel style: a wide low **building block** and a
  flat **tarmac pad** with painted markings (pad draws under any sprite sharing its slot).
- Scenery items join the existing depth-sorted `items` pass with negative ids, exactly
  like the current left-apron scenery.

Budget: ~10–15 additional sprites per frame on Canvas 2D — no perf concern. Zero-alloc
applies to `update()` only (per SPECS §12); render follows the existing per-frame item
pattern.

## Testing

- **Phase windows** (new tests in `tests/gameplay.test.ts` or a new `phases.test.ts`):
  `localY = 0` → approach with no floor; `localY = APPROACH_END` → fortress1 with floor;
  negative `localY` after a simulated loop rebase → approach again.
- **Wall clearance** (extend `tests/collision.test.ts` / `gameplay.test.ts`): perimeter
  wall clearance at `z = wallHeight + SHIP_HH + 1` (clears) and `z = wallHeight - 1`
  (dies), matching the existing clearance-test convention and using the real height from
  the level data, not SPECS sample values.
- **Renderer smoke** (extend `tests/renderer.test.ts`): render with the right apron
  active produces no depth-order regression (existing golden/smoke pattern).
- **Feel tuning** (manual, Jared): approach length, wall height, scenery density. These
  are playtest knobs; constants live in one place each (`APPROACH_END` in `phases.ts`,
  wall heights in `level1.json`, cluster spacing in `renderer.ts`).

## Out of scope

- Gun-sight reticle, radar scoring rebalance, space-phase plane counter (items 1–4 of the
  comparison review — separate efforts).
- Rebasing `floorGaps` per loop (pre-existing quirk, unrelated to this feature).
- Any change to enemy behavior or difficulty tiers.
