# Approach Sequence & Dense Fortress Scenery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the arcade-authentic playable approach sequence (fly in over open space, climb the perimeter wall) and dense two-sided fortress scenery to Ultra Zaxxon.

**Architecture:** A new `approach` phase (`localY < 150`, no floor) in the existing phase state machine plus one new perimeter wall in `level1.json` delivers the fly-in; the exit/entry walls at y=1960/2880 already exist. Scenery work is renderer-only: mirror the left apron/cliff onto the right side of `drawFloor`, and replace the sparse single-sprite scatter with hash-driven clusters on both aprons using two new atlas sprites.

**Tech Stack:** TypeScript strict, Canvas 2D, Vitest. No runtime dependencies (repo rule).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-approach-scenery-design.md`.
- Zero allocation inside `update()` (SPECS §12). Render-pass per-frame item objects follow the existing pattern and are allowed.
- No RNG in render — deterministic `hash()` only (existing rule in `renderer.ts`).
- Tests use real constants from the code/level data, never SPECS.md sample values.
- Real constants: `SCROLL_SPEED = 30`, `PHASE1_END = 2000`, `PHASE2_END = 2800`, `PHASE3_END = 3600`, `BOSS_Y = 3500`, `SHIP_HH = 1.4`, ship spawns at `z = 50`.
- All commands run from the repo root. Full suite: `npx vitest run`. Also available: `npm run lint`, `npm run build` (runs `tsc --noEmit` first).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `approach` phase in the phase state machine

**Files:**
- Modify: `src/world/phases.ts`
- Test: `tests/phases.test.ts` (create)

**Interfaces:**
- Consumes: `createGame()` from `src/game.ts` (exposes `hasFloor`, `ship`, `cameraY`, `score`, `update(dt)`); `createPhases()` from `src/world/phases.ts` (`Phases` has mutable `loopN`, `name`, `hasFloor`, `update(game, dt)`).
- Produces: `export const APPROACH_END = 150` from `src/world/phases.ts`; `PhaseName` union gains `'approach'`. Task 2's tests and any HUD work rely on `APPROACH_END`.

- [ ] **Step 1: Write the failing tests**

Create `tests/phases.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game';
import { createPhases, APPROACH_END, PHASE3_END } from '../src/world/phases';

const DT = 1 / 60;

describe('approach phase (arcade opening: fly in over space, climb the perimeter wall)', () => {
  it('the game opens over open space — no floor under the ship', () => {
    const game = createGame();
    game.update(DT);
    expect(game.hasFloor).toBe(false);
  });

  it('the fortress floor arrives at APPROACH_END', () => {
    const game = createGame();
    game.ship.y = APPROACH_END + 1;
    game.update(DT);
    expect(game.hasFloor).toBe(true);
  });

  it('entering the fortress pays no phase bonus (approach is not a completed phase)', () => {
    const game = createGame();
    game.ship.y = APPROACH_END - 1;
    game.update(DT);
    game.ship.y = APPROACH_END + 1;
    game.update(DT);
    expect(game.score).toBe(0);
  });

  it('the space phase still has no floor and fortress 2 still does', () => {
    const game = createGame();
    game.ship.y = 2400; // inside space phase (2000..2800)
    game.update(DT);
    expect(game.hasFloor).toBe(false);
    game.ship.y = 2900; // inside fortress 2
    game.update(DT);
    expect(game.hasFloor).toBe(true);
  });

  it('each loop re-opens with an approach: negative localY after rebase is approach', () => {
    const game = createGame();
    const phases = createPhases();
    phases.loopN = 1;
    game.cameraY = PHASE3_END - 50; // localY = -50 relative to loop 1
    phases.update(game, DT);
    expect(phases.name).toBe('approach');
    expect(phases.hasFloor).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/phases.test.ts`
Expected: FAIL — `APPROACH_END` is not exported (import error), or `hasFloor` is `true` at game start.

- [ ] **Step 3: Implement the phase**

In `src/world/phases.ts`, four edits:

3a. Add the constant next to the other phase constants (after line 8 `export const BOSS_Y = 3500;`):

```ts
export const APPROACH_END = 150; // open-space fly-in before the perimeter wall (~5s at base scroll)
```

3b. Extend the union:

```ts
type PhaseName = 'approach' | 'fortress1' | 'space' | 'fortress2' | 'boss';
```

3c. In `createPhases()`, change the initial `name: 'fortress1',` to `name: 'approach',` (so frame 1 does not register a phantom `fortress1 → approach` transition), and replace the name/floor/bonus block inside `update` with:

```ts
      const localY = game.cameraY - phases.loopN * PHASE3_END;
      const prev = phases.name;
      phases.name =
        localY < APPROACH_END
          ? 'approach'
          : localY < PHASE1_END
            ? 'fortress1'
            : localY < PHASE2_END
              ? 'space'
              : localY < BOSS_Y - 45 // far enough for dodge time, still inside the visible window
                ? 'fortress2'
                : 'boss';

      phases.hasFloor = phases.name !== 'space' && phases.name !== 'approach';
      phases.fuelFrozen = phases.name === 'boss';

      // end-of-phase fuel bonus (fuel × 10), once per transition. Leaving the
      // approach pays nothing — it is a fly-in, not a completed phase.
      if (prev !== phases.name && prev !== 'approach' && bonusPaid !== phases.name) {
        game.score += Math.round(game.ship.fuel * 10);
        bonusPaid = phases.name;
      }
```

3d. In the boss-end block (currently `phases.name = 'fortress1';`), set:

```ts
            phases.name = 'approach';
```

This preserves today's zero-payout at loop rollover (the direct assignment is not a detected transition, and the subsequent `approach → fortress1` is skipped by the `prev !== 'approach'` guard).

- [ ] **Step 4: Run the new tests, then the full suite**

Run: `npx vitest run tests/phases.test.ts`
Expected: PASS (5 tests)

Run: `npx vitest run`
Expected: PASS. If an existing test fails because it assumed a floor at y≈0, fix the test's ship position to be past `APPROACH_END` only if the test is about floor behavior — report anything else before changing it.

- [ ] **Step 5: Commit**

```bash
git add src/world/phases.ts tests/phases.test.ts
git commit -m "feat: playable approach phase — each loop opens flying in over open space

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Perimeter wall and opening-drum relocation in level data

**Files:**
- Modify: `src/levels/level1.json`
- Test: `tests/level.test.ts` (create)

**Interfaces:**
- Consumes: `createSpawner` from `src/world/spawner.ts` (sorts segments internally, so JSON order is cosmetic — keep it ascending by y anyway); `overlap` from `src/math/collision.ts`; `createShip`, `SHIP_HH` from `src/entities/ship.ts`; `APPROACH_END` from Task 1.
- Produces: a full-span wall segment `{type: 'wall', y: 170, xStart: 0, xEnd: 100, height: 25}`. The exit wall (y=1960, height 30) and fortress-2 entry wall (y=2880, height 25) already exist — do not add duplicates.

- [ ] **Step 1: Write the failing tests**

Create `tests/level.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import level1 from '../src/levels/level1.json';
import type { Segment } from '../src/entities/types';
import { createSpawner } from '../src/world/spawner';
import { overlap } from '../src/math/collision';
import { createShip, SHIP_HH } from '../src/entities/ship';
import { APPROACH_END } from '../src/world/phases';

const segments = level1.segments as unknown as Segment[];

describe('perimeter walls (arcade approach: climb over to enter, fly out over the exit)', () => {
  const fullSpanWallAt = (y: number) =>
    segments.find((s) => s.type === 'wall' && s.y === y && s.xStart === 0 && s.xEnd === 100);

  it('a full-span entry wall guards the fortress just past the approach', () => {
    const wall = fullSpanWallAt(170);
    expect(wall).toBeDefined();
    expect(wall?.height).toBe(25);
  });

  it('the fortress 1 exit and fortress 2 entry walls are present', () => {
    expect(fullSpanWallAt(1960)).toBeDefined();
    expect(fullSpanWallAt(2880)).toBeDefined();
  });

  it('ship clears the entry wall at wallHeight + SHIP_HH + 1 and dies at wallHeight - 1', () => {
    const wall = fullSpanWallAt(170);
    if (!wall) throw new Error('entry wall missing');
    const spawner = createSpawner([wall]);
    spawner.update(170); // wall y is inside the lookahead window
    const e = spawner.entities.find((en) => en.live);
    if (!e) throw new Error('entry wall did not spawn');
    const ship = createShip();
    ship.y = 170;
    const h = wall.height ?? 30;
    ship.z = h + SHIP_HH + 1;
    expect(overlap(ship, e)).toBe(false);
    ship.z = h - 1;
    expect(overlap(ship, e)).toBe(true);
  });

  it('nothing spawns in open space: no segment sits before the entry wall', () => {
    const minY = Math.min(...segments.map((s) => s.y));
    expect(minY).toBe(170);
    expect(minY).toBeGreaterThan(APPROACH_END);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/level.test.ts`
Expected: FAIL — no wall at y=170; min segment y is 120 (the opening fuel drums).

- [ ] **Step 3: Edit the level data**

In `src/levels/level1.json`, replace the first two segments (the fuel drums at y=120 and y=140) and insert the entry wall so the file begins:

```json
  "segments": [
    {
      "type": "wall",
      "y": 170,
      "xStart": 0,
      "xEnd": 100,
      "height": 25
    },
    {
      "type": "wall",
      "y": 220,
      "xStart": 0,
      "xEnd": 100,
      "height": 20
    },
    {
      "type": "fuelDrum",
      "y": 250,
      "x": 40
    },
    {
      "type": "fuelDrum",
      "y": 270,
      "x": 75
    },
    {
      "type": "radar",
      "y": 300,
      "x": 25
    },
```

(The wall at y=220 and everything from the radar at y=300 onward are unchanged — the drums move from y=120/140 to y=250/270, with the second drum at x=75 so the strafe line doesn't feed straight into the zap hole at y=300, x=60.)

- [ ] **Step 4: Run the new tests, then the full suite**

Run: `npx vitest run tests/level.test.ts`
Expected: PASS (4 tests)

Run: `npx vitest run`
Expected: PASS (no other test references the y=120/140 drums — they build their own spawners).

- [ ] **Step 5: Playability sanity check**

Run: `npm run build`
Expected: clean `tsc --noEmit` + Vite build. (Manual feel check — approach length, wall height — is Jared's playtest; do not tune constants yourself.)

- [ ] **Step 6: Commit**

```bash
git add src/levels/level1.json tests/level.test.ts
git commit -m "feat: perimeter entry wall at the fortress edge; opening drums move inside

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Right-side apron and cliff face in `drawFloor`

**Files:**
- Modify: `src/render/renderer.ts` (the `drawFloor` function, currently ~lines 419–517)
- Test: `tests/renderer.test.ts` (extend)

**Interfaces:**
- Consumes: existing `project`, `p` scratch `Vec3`, `ex`/`ey` tile-edge constants inside `drawFloor`; `stubCtx`/`recordingAtlas` helpers in `tests/renderer.test.ts`.
- Produces: platform floor spanning x ∈ [−20, 120] with cliff faces on both rims. Task 4 places scenery on the new right apron (x 100..120).

- [ ] **Step 1: Write the failing test**

Add to `tests/renderer.test.ts` (reuse the file's `stubCtx`, `recordingAtlas`, and `RenderWorld` literal shape):

```ts
describe('floating platform reads from both sides', () => {
  it('cliff faces draw on the left AND right rims (two path fills per row each)', () => {
    const log: string[] = [];
    const renderer = createRenderer(stubCtx(log), recordingAtlas([]));
    const world: RenderWorld = {
      ship: createShip(),
      entities: [],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: true,
      time: 0,
      floorGaps: [],
      impacts: [],
    };
    renderer.render(world, 0);
    // drawFloor paints rows wy = -20..90 (12 rows). Each row's cliff face is a
    // '#1c1c2a' path fill; left-only would give 12 — both rims give 24.
    const cliffFills = log.filter((l) => l === 'fill:#1c1c2a').length;
    expect(cliffFills).toBeGreaterThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer.test.ts`
Expected: FAIL — only 12 cliff fills (left rim only).

- [ ] **Step 3: Mirror the apron and cliff onto the right side**

In `src/render/renderer.ts`, inside `drawFloor`'s per-row loop, insert after the corridor-tile loop (`for (let wx = 0; wx < 100; wx += 10) { ... }` block ends at ~line 515), still inside the `for (let wy = ...)` row loop:

```ts
      // decorative apron strip right of the corridor — mirror of the left side
      for (let wx = 100; wx < 120; wx += 10) {
        p.x = wx;
        p.y = wy;
        p.z = 0;
        const a = project(p, cameraY);
        ctx.fillStyle = ((wx + wy) / 10) % 2 === 0 ? '#101c28' : '#0d1822';
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + ex, a.sy + ey);
        ctx.lineTo(a.sx + ex + ex, a.sy);
        ctx.lineTo(a.sx + ex, a.sy - ey);
        ctx.closePath();
        ctx.fill();
      }

      // right-hand cliff face at the x=120 rim — the platform floats in space
      // from both sides (same construction as the left rim at x=-20)
      p.y = wy;
      p.z = 0;
      p.x = 120;
      const er = project(p, cameraY);
      ctx.fillStyle = '#1c1c2a';
      ctx.fillRect(er.sx - 1, er.sy, 3, 30); // right edge pillar
      ctx.beginPath();
      ctx.moveTo(er.sx, er.sy);
      ctx.lineTo(er.sx + ex, er.sy - ey); // along +y edge
      ctx.lineTo(er.sx + ex, er.sy - ey + 28);
      ctx.lineTo(er.sx, er.sy + 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4a4a62'; // lit rim
      ctx.beginPath();
      ctx.moveTo(er.sx, er.sy);
      ctx.lineTo(er.sx + ex, er.sy - ey);
      ctx.lineTo(er.sx + ex, er.sy - ey + 3);
      ctx.lineTo(er.sx, er.sy + 3);
      ctx.closePath();
      ctx.fill();
```

- [ ] **Step 4: Run the test, the full suite, and eyeball it**

Run: `npx vitest run tests/renderer.test.ts`
Expected: PASS

Run: `npx vitest run && npm run build`
Expected: PASS / clean build.

Then run `npm run dev` briefly and confirm in the browser: the platform now shows a cliff face on the bottom-right rim and apron tiles right of the corridor; no z-fighting or draw-order artifacts when walls scroll past. Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add src/render/renderer.ts tests/renderer.test.ts
git commit -m "feat: right-side apron and cliff face — the fortress floats from both sides

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: New sprites + clustered scenery on both aprons

**Files:**
- Modify: `src/render/sprites.ts` (SpriteName union + GRIDS)
- Modify: `src/render/renderer.ts` (SCENERY constant ~line 253 and the scenery block in `render()` ~lines 524–546)
- Test: `tests/renderer.test.ts` (extend)

**Interfaces:**
- Consumes: `hash(n)` and `depthKey` already in `renderer.ts`; `atlas.draw(ctx, name, frame, sx, sy)` / `atlas.size(name)`; the right apron from Task 3.
- Produces: `SpriteName` gains `'building'` and `'pad'`. `SCENERY_CLUSTERS: readonly (readonly SpriteName[])[]` replaces the `SCENERY` array in `renderer.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/renderer.test.ts`:

```ts
describe('clustered apron scenery', () => {
  const SCENERY_SET = new Set<SpriteName>([
    'hangar',
    'tower',
    'silo',
    'antenna',
    'bunker',
    'building',
    'pad',
  ]);
  const world = (hasFloor: boolean): RenderWorld => ({
    ship: createShip(),
    entities: [],
    playerShots: [],
    enemyShots: [],
    cameraY: 0,
    hasFloor,
    time: 0,
    floorGaps: [],
    impacts: [],
  });

  it('clusters populate both aprons: at least 8 scenery draws in one frame', () => {
    const calls: [SpriteName, number][] = [];
    const renderer = createRenderer(stubCtx(), recordingAtlas(calls));
    renderer.render(world(true), 0);
    const scenery = calls.filter(([name]) => SCENERY_SET.has(name));
    // 5 row-slots (wy -30..90, step 30) × 2 sides, each cluster ≥ 1 sprite
    expect(scenery.length).toBeGreaterThanOrEqual(8);
  });

  it('no scenery over open space', () => {
    const calls: [SpriteName, number][] = [];
    const renderer = createRenderer(stubCtx(), recordingAtlas(calls));
    renderer.render(world(false), 0);
    expect(calls.some(([name]) => SCENERY_SET.has(name))).toBe(false);
  });
});
```

(`SpriteName` union check: `'building'`/`'pad'` in `SCENERY_SET` won't compile until Step 3's sprites.ts change — that is the failing-state for types.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer.test.ts`
Expected: FAIL — type error on `'building'`/`'pad'`, or fewer than 8 scenery draws (old code: one sprite per 60 y-units, left side only ⇒ 3).

- [ ] **Step 3: Add the two sprites**

In `src/render/sprites.ts`, extend the union (after `| 'bunker'`):

```ts
  | 'building'
  | 'pad'
```

And add to `GRIDS` (after the `bunker` entry, same pixel style/palette):

```ts
  building: [[
    '..MMMMMMMMMMMMMMMMMMMMMM..',
    '.MLLLLLLLLLLLLLLLLLLLLLLM.',
    'MNNNNNNNNNNNNNNNNNNNNNNNNM',
    'MNKKNNKKNNKKNNKKNNKKNNKKNM',
    'MNKKNNKKNNKKNNKKNNKKNNKKNM',
    'MNNNNNNNNNNNNNNNNNNNNNNNNM',
    'MNKKNNKKNNKKNNKKNNKKNNKKNM',
    'MNKKNNKKNNKKNNKKNNKKNNKKNM',
    'MNNNNNNNNNNNNNNNNNNNNNNNNM',
    'KKKKKKKKKKKKKKKKKKKKKKKKKK',
  ]],
  pad: [[
    'NNNNNNNNNNNNNNNNNNNN',
    'NLNNNNNNNNNNNNNNNNLN',
    'NNNNNYYNNNNNNYYNNNNN',
    'NNNNNYYNNNNNNYYNNNNN',
    'NLNNNNNNNNNNNNNNNNLN',
    'NNNNNNNNNNNNNNNNNNNN',
  ]],
```

- [ ] **Step 4: Replace the scenery scatter with clusters**

In `src/render/renderer.ts`, replace the `SCENERY` constant (~line 253):

```ts
// hash-picked scenery clusters for the aprons; composition varies along the run
const SCENERY_CLUSTERS: readonly (readonly SpriteName[])[] = [
  ['hangar', 'silo'],
  ['tower', 'antenna'],
  ['bunker'],
  ['building'],
  ['silo', 'silo'],
  ['building', 'antenna'],
  ['hangar'],
  ['tower', 'bunker'],
];
```

And replace the scenery block inside `render()` (the `if (w.hasFloor) { ... }` block that scatters one sprite per 60 y-units on the left apron, ~lines 524–546):

```ts
      // decorative scenery clusters on BOTH aprons (no collision) —
      // deterministic per world row+side, depth-sorted with everything else
      if (w.hasFloor) {
        const s0 = Math.floor((w.cameraY - 20) / 30) * 30;
        for (let sy = s0; sy < w.cameraY + 100; sy += 30) {
          for (let side = 0; side < 2; side++) {
            const h = hash(sy * 31 + side * 7);
            const cluster = SCENERY_CLUSTERS[h % SCENERY_CLUSTERS.length];
            if (!cluster) continue;
            const sxw = side === 0 ? -16 + (h % 4) : 105 + (h % 4);
            const syw = sy + (h % 17);
            items.push({
              key: depthKey({ x: sxw, y: syw, z: 0 }),
              id: -1000 - sy * 2 - side,
              draw: () => {
                p.x = sxw;
                p.y = syw;
                p.z = 0;
                const s = project(p, w.cameraY);
                if (h % 3 === 0) atlas.draw(ctx, 'pad', 0, s.sx, s.sy); // tarmac under the cluster
                for (let ci = 0; ci < cluster.length; ci++) {
                  const kind = cluster[ci];
                  if (!kind) continue;
                  p.x = sxw;
                  p.y = syw + ci * 9;
                  p.z = 0;
                  const cs = project(p, w.cameraY);
                  atlas.draw(ctx, kind, 0, cs.sx, cs.sy - atlas.size(kind).h / 2 + 3);
                }
              },
            });
          }
        }
      }
```

(Keep the shared scratch `p` usage inside `draw()` — that is the existing pattern for deferred items in this file.)

- [ ] **Step 5: Run the tests, full suite, build, and eyeball it**

Run: `npx vitest run tests/renderer.test.ts`
Expected: PASS

Run: `npx vitest run && npm run lint && npm run build`
Expected: all clean. If `SCENERY` is now unused, the lint failure will say so — the constant should have been fully replaced, not left behind.

Then `npm run dev` and confirm: clusters on both aprons at varied spacing, pads under some, nothing inside the 0–100 corridor, no depth popping against walls. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/render/sprites.ts src/render/renderer.ts tests/renderer.test.ts
git commit -m "feat: dense clustered scenery on both aprons with building and tarmac sprites

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: README + final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: player-facing docs mention the approach.

- [ ] **Step 1: Update README**

In `README.md` "How to Play", insert after the **Walls** bullet:

```markdown
- **The approach:** each run (and each loop) opens flying over open space — no floor,
  no shadow. The fortress perimeter wall scrolls in fast; climb over it to enter.
```

And in "Features", change the phases line to:

```markdown
- Each loop: Approach → Fortress 1 → Space → Fortress 2 → Boss fight
```

- [ ] **Step 2: Full verification**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass, clean. Report the actual output.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the approach sequence in the README

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Out of scope (from the spec)

- Gun-sight reticle, radar scoring, space-phase plane counter.
- `floorGaps` not rebasing per loop (pre-existing quirk).
- Feel tuning (`APPROACH_END`, wall height, cluster spacing) — Jared playtests; constants each live in one place.
