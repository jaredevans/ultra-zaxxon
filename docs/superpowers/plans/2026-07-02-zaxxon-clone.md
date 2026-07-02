# Zaxxon Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete, deployable 2.5D Zaxxon-style isometric shoot-'em-up per `SPECS.md` v3 and the approved design addendum (`docs/superpowers/specs/2026-07-02-zaxxon-clone-design.md`).

**Architecture:** All gameplay in true 3D world coordinates (x lateral, y forward, z altitude); isometric 2:1 dimetric projection is render-only. Fixed-timestep update (60 Hz) with interpolated render. Data-driven level segments spawned by lookahead. Procedural pixel-art sprite atlas and synthesized Web Audio SFX — zero binary assets, zero runtime dependencies.

**Tech Stack:** TypeScript (strict), Vite, Canvas 2D, Vitest, ESLint + Prettier, localStorage.

## Global Constraints

Copied from SPECS.md — every task implicitly includes these:

- `tsconfig`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`. `tsc --noEmit` must pass after every task.
- **Zero runtime dependencies.** devDependencies only (vite, typescript, vitest, eslint, prettier).
- **No allocation inside `update()`** — pool projectiles (player: 8, enemy: 32), reuse arrays/objects. Allocation at boot or on state transitions only.
- **Never exact equality on coordinates** — all collision is interval overlap on AABBs.
- World axes: `x` 0–100 lateral, `y` forward (monotonic), `z` 0–90 altitude (player clamp 8–90). The world never moves; camera follows `ship.y`.
- Projection constants: `TILE_W = 32`, `TILE_H = 16`, `Z_SCALE = 2.2`. Internal resolution 480×640, integer-ish scale, letterboxed, `imageSmoothingEnabled = false`.
- Depth sort: `depthKey(p) = (p.x + p.y) * 1000 + p.z`, ascending; ties broken by entity `id`.
- Input: key-state map sampled in fixed update; never act in `keydown`. `blur` clears the key set.
- Controls: ArrowUp = dive, ArrowDown = climb (authentic default; `I` toggles inversion, persisted), Arrow L/R lateral, Space autofire ~4/s, max 4 live player shots.
- localStorage keys versioned (`zaxxon.scores.v1`, `zaxxon.settings.v1`), all reads in try/catch.
- Audio: Web Audio pooled buffers only, never `new Audio()`; context resumed on first user gesture.
- Commit message style: `feat:`/`test:`/`chore:` prefixes, present tense, with the Claude co-author trailer used in this repo.

## File Structure

```
zaxxon-clone/
├── index.html                    # canvas + module script
├── vite.config.ts                # vitest config inline
├── tsconfig.json
├── package.json                  # scripts: dev/build/test/lint
├── src/
│   ├── main.ts                   # bootstrap: canvas, scaling, game state machine, loop start
│   ├── loop.ts                   # fixed-timestep accumulator + visibility pause
│   ├── input.ts                  # key-state map, blur clear
│   ├── settings.ts               # invertY/muted persistence (localStorage)
│   ├── math/
│   │   ├── projection.ts         # worldToScreen, depthKey        ← unit tested
│   │   └── collision.ts          # overlap, projectileHit         ← unit tested
│   ├── entities/
│   │   ├── types.ts              # ALL shared interfaces
│   │   ├── ship.ts               # movement, state machine, fuel consumption
│   │   ├── projectiles.ts        # pooled player+enemy shots
│   │   ├── enemies.ts            # turret/fighter/missile AI
│   │   └── boss.ts               # Zaxxon robot
│   ├── world/
│   │   ├── spawner.ts            # segment lookahead spawn/despawn
│   │   ├── phases.ts             # phase machine + difficulty scaling
│   │   └── shadow.ts             # floorHeightAt / hasFloorAt
│   ├── render/
│   │   ├── renderer.ts           # depth-sorted draw pass
│   │   ├── sprites.ts            # procedural pixel-art atlas
│   │   └── hud.ts                # altimeter, fuel, score, lives
│   ├── audio.ts                  # synthesized SFX, pooled buffers
│   ├── scores.ts                 # top-10 high scores (localStorage)
│   └── levels/
│       └── level1.json           # segment data, all 3 phases
└── tests/
    ├── projection.test.ts
    ├── collision.test.ts
    └── spawner.test.ts
```

Two small, justified additions to the spec's tree: `settings.ts` and `scores.ts` isolate localStorage handling (versioned keys + try/catch) so game code never touches storage directly; `spawner.test.ts` covers the lookahead window logic, which is cheap to test and easy to get wrong.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.prettierrc`, `eslint.config.js`, `src/main.ts` (stub)

**Interfaces:**
- Consumes: nothing.
- Produces: working `npm run dev`, `npm run build`, `npm test`, `npm run lint`; `index.html` exposes `<canvas id="game">`.

- [ ] **Step 1: Init npm and install dev deps**

```bash
cd /Users/jared/github_projects/zaxxon-clone
npm init -y
npm install -D typescript vite vitest eslint @eslint/js typescript-eslint prettier
```

- [ ] **Step 2: Write config files**

`package.json` — replace scripts section with:

```json
{
  "name": "zaxxon-clone",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests && prettier --check ."
  }
}
```

(keep the devDependencies npm wrote; there must be no `dependencies` key)

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: { environment: 'node' },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zaxxon</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      body { display: flex; align-items: center; justify-content: center; }
      canvas { image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules/
dist/
```

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100 }
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  { ignores: ['dist/'] },
);
```

`src/main.ts` (stub, replaced in Task 5):

```ts
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');
console.log('zaxxon: scaffold ok');
```

- [ ] **Step 3: Verify toolchain**

Run: `npx tsc --noEmit` — expected: exit 0, no output.
Run: `npm run build` — expected: `dist/` produced.
Run: `npm test` — expected: "No test files found" is acceptable at this stage ONLY; vitest exits non-zero on no tests, so use `vitest run --passWithNoTests` manually to confirm the runner works: `npx vitest run --passWithNoTests` — expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + TypeScript strict + Vitest project"
```

---

### Task 2: Projection math (TDD)

**Files:**
- Create: `src/math/projection.ts`
- Test: `tests/projection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Vec3 { x, y, z }`, `TILE_W = 32`, `TILE_H = 16`, `Z_SCALE = 2.2`, `worldToScreen(p: Vec3, cameraY: number, origin: {x: number; y: number}): { sx: number; sy: number }`, `depthKey(p: Vec3): number`.

- [ ] **Step 1: Write the failing tests**

`tests/projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { worldToScreen, depthKey, TILE_W, TILE_H, Z_SCALE } from '../src/math/projection';

const ORIGIN = { x: 240, y: 100 };

describe('worldToScreen', () => {
  it('projects the camera-relative origin to the screen origin', () => {
    const { sx, sy } = worldToScreen({ x: 0, y: 50, z: 0 }, 50, ORIGIN);
    expect(sx).toBe(ORIGIN.x);
    expect(sy).toBe(ORIGIN.y);
  });

  it('moves +x right-and-down along the dimetric axis', () => {
    const a = worldToScreen({ x: 0, y: 0, z: 0 }, 0, ORIGIN);
    const b = worldToScreen({ x: 10, y: 0, z: 0 }, 0, ORIGIN);
    expect(b.sx - a.sx).toBe(10 * (TILE_W / 2));
    expect(b.sy - a.sy).toBe(10 * (TILE_H / 2));
  });

  it('moves +y (forward) left-and-down: away from camera', () => {
    const a = worldToScreen({ x: 0, y: 0, z: 0 }, 0, ORIGIN);
    const b = worldToScreen({ x: 0, y: 10, z: 0 }, 0, ORIGIN);
    expect(b.sx - a.sx).toBe(-10 * (TILE_W / 2));
    expect(b.sy - a.sy).toBe(10 * (TILE_H / 2));
  });

  it('altitude moves the point straight up on screen, sx unchanged', () => {
    const lo = worldToScreen({ x: 40, y: 60, z: 0 }, 50, ORIGIN);
    const hi = worldToScreen({ x: 40, y: 60, z: 30 }, 50, ORIGIN);
    expect(hi.sx).toBe(lo.sx);
    expect(lo.sy - hi.sy).toBeCloseTo(30 * Z_SCALE, 10);
  });

  it('is camera-invariant: same relative position projects identically', () => {
    const a = worldToScreen({ x: 25, y: 100, z: 40 }, 90, ORIGIN);
    const b = worldToScreen({ x: 25, y: 2100, z: 40 }, 2090, ORIGIN);
    expect(a).toEqual(b);
  });
});

describe('depthKey', () => {
  it('orders farther (x+y greater) entities later (drawn on top)', () => {
    expect(depthKey({ x: 10, y: 20, z: 0 })).toBeLessThan(depthKey({ x: 10, y: 21, z: 0 }));
  });

  it('orders higher z later at the same x+y (drawn above)', () => {
    expect(depthKey({ x: 10, y: 20, z: 5 })).toBeLessThan(depthKey({ x: 10, y: 20, z: 6 }));
  });

  it('x+y dominates z (a wall 1 unit nearer sorts before anything on it)', () => {
    expect(depthKey({ x: 10, y: 20, z: 90 })).toBeLessThan(depthKey({ x: 10, y: 21, z: 0 }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/projection.test.ts`
Expected: FAIL — cannot resolve `../src/math/projection`.

- [ ] **Step 3: Implement**

`src/math/projection.ts` (verbatim from SPECS.md §2.1):

```ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const TILE_W = 32;
export const TILE_H = 16;
export const Z_SCALE = 2.2; // screen px per altitude unit

export function worldToScreen(p: Vec3, cameraY: number, origin: { x: number; y: number }) {
  const relY = p.y - cameraY;
  return {
    sx: origin.x + (p.x - relY) * (TILE_W / 2),
    sy: origin.y + (p.x + relY) * (TILE_H / 2) - p.z * Z_SCALE,
  };
}

/** Depth key for painter's algorithm: sort ascending. */
export function depthKey(p: Vec3): number {
  return (p.x + p.y) * 1000 + p.z;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/projection.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/projection.ts tests/projection.test.ts
git commit -m "feat: dimetric projection and painter depth key with tests"
```

---

### Task 3: Collision math (TDD)

**Files:**
- Create: `src/math/collision.ts`
- Test: `tests/collision.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `src/math/projection.ts`.
- Produces: `AABB extends Vec3 { hw: number; hd: number; hh: number }`, `overlap(a: AABB, b: AABB): boolean`, `projectileHit(p: SweptBox, t: AABB): boolean` where `SweptBox = AABB & { yPrev: number }`, and `wallAABB(xStart: number, xEnd: number, y: number, height: number, hd?: number): AABB`.

Note: `AABB` lives here (not in `entities/types.ts`) so the math module has zero upward imports; `entities/types.ts` re-exports it in Task 4.

- [ ] **Step 1: Write the failing tests**

`tests/collision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { overlap, projectileHit, wallAABB, type AABB } from '../src/math/collision';

const box = (p: Partial<AABB>): AABB => ({ x: 0, y: 0, z: 0, hw: 1, hd: 1, hh: 1, ...p });

describe('overlap', () => {
  it('detects interpenetration and rejects separation on each axis', () => {
    const a = box({});
    expect(overlap(a, box({ x: 1.9 }))).toBe(true);
    expect(overlap(a, box({ x: 2.1 }))).toBe(false);
    expect(overlap(a, box({ y: 2.1 }))).toBe(false);
    expect(overlap(a, box({ z: 2.1 }))).toBe(false);
  });

  it('treats exact touching as non-collision (strict inequality)', () => {
    expect(overlap(box({}), box({ x: 2 }))).toBe(false);
  });
});

describe('walls (SPECS §5.2 acceptance: clearance at wallHeight ± 1)', () => {
  const H = 40;
  const wall = wallAABB(0, 100, 500, H); // full-corridor wall at y=500
  const ship = (z: number): AABB => ({ x: 50, y: 500, z, hw: 3, hd: 3, hh: 2 });

  it('ship at z = wallHeight + hh + 1 clears', () => {
    expect(overlap(ship(H + 2 + 1), wall)).toBe(false);
  });

  it('ship at z = wallHeight - 1 dies', () => {
    expect(overlap(ship(H - 1), wall)).toBe(true);
  });

  it('slotted wall: two AABBs with an x gap let the ship through the slot', () => {
    const left = wallAABB(0, 40, 500, H);
    const right = wallAABB(60, 100, 500, H);
    const inSlot: AABB = { x: 50, y: 500, z: 20, hw: 3, hd: 3, hh: 2 };
    expect(overlap(inSlot, left)).toBe(false);
    expect(overlap(inSlot, right)).toBe(false);
    expect(overlap({ ...inSlot, x: 30 }, left)).toBe(true);
  });
});

describe('projectileHit (swept, SPECS §5.3)', () => {
  const target = box({ y: 100, hd: 0.5 }); // 1-unit-deep target
  const proj = (yPrev: number, y: number) =>
    ({ x: 0, y, z: 0, hw: 0.5, hd: 0.5, hh: 0.5, yPrev });

  it('does not tunnel a 1-unit target at max projectile speed (90 u/s @ 60 Hz = 1.5 u/tick)', () => {
    expect(projectileHit(proj(99.4, 100.9), target)).toBe(true);
  });

  it('hits when the swept segment fully jumps the target in one tick', () => {
    expect(projectileHit(proj(99.0, 102.0), target)).toBe(true);
  });

  it('misses when laterally offset even if y sweeps through', () => {
    expect(projectileHit({ ...proj(99.0, 102.0), x: 5 }, target)).toBe(false);
  });

  it('misses when above the target even if y sweeps through', () => {
    expect(projectileHit({ ...proj(99.0, 102.0), z: 5 }, target)).toBe(false);
  });

  it('misses when the sweep stops short', () => {
    expect(projectileHit(proj(98.0, 99.0), target)).toBe(false);
  });
});

describe('hitbox forgiveness (SPECS §5.3: player hitbox ≈ 70% of sprite)', () => {
  it('a graze that hits the sprite box misses the 70% hitbox', () => {
    const SPRITE_HW = 3;
    const playerHitbox = box({ hw: SPRITE_HW * 0.7, hd: 2, hh: 1.4 });
    const enemyShot = box({ x: SPRITE_HW * 0.7 + 0.3, hw: 0.3, hd: 0.3, hh: 0.3 });
    expect(overlap(playerHitbox, enemyShot)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/collision.test.ts`
Expected: FAIL — cannot resolve `../src/math/collision`.

- [ ] **Step 3: Implement**

`src/math/collision.ts`:

```ts
import type { Vec3 } from './projection';

export interface AABB extends Vec3 {
  hw: number; // half-width  (x)
  hd: number; // half-depth  (y)
  hh: number; // half-height (z)
}

export type SweptBox = AABB & { yPrev: number };

export function overlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw &&
    Math.abs(a.y - b.y) < a.hd + b.hd &&
    Math.abs(a.z - b.z) < a.hh + b.hh
  );
}

/** Swept y-interval test: projectiles are fast along y; point tests tunnel. */
export function projectileHit(p: SweptBox, t: AABB): boolean {
  const yLo = Math.min(p.yPrev, p.y);
  const yHi = Math.max(p.yPrev, p.y);
  return (
    Math.abs(p.x - t.x) < p.hw + t.hw &&
    Math.abs(p.z - t.z) < p.hh + t.hh &&
    yLo < t.y + t.hd + p.hd &&
    yHi > t.y - t.hd - p.hd
  );
}

/** Wall as AABB per SPECS §5.2: z centered at height/2, hh = height/2. */
export function wallAABB(xStart: number, xEnd: number, y: number, height: number, hd = 2): AABB {
  return {
    x: (xStart + xEnd) / 2,
    y,
    z: height / 2,
    hw: (xEnd - xStart) / 2,
    hd,
    hh: height / 2,
  };
}
```

The swept test generalizes the spec snippet with `min/max` so it also works for enemy shots traveling `−y` (spec §5.3: "same system reversed").

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/collision.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/collision.ts tests/collision.test.ts
git commit -m "feat: AABB overlap and swept projectile collision with tests"
```

---

### Task 4: Shared types, input, settings

**Files:**
- Create: `src/entities/types.ts`, `src/input.ts`, `src/settings.ts`

**Interfaces:**
- Consumes: `Vec3` (projection), `AABB` (collision).
- Produces (used by every later task):
  - `types.ts`: re-exports `Vec3`, `AABB`; `ShipState`, `Ship`, `Projectile`, `EntityKind`, `Entity`, `Segment`, `GameMode`.
  - `input.ts`: `isDown(code: string): boolean`, `consumePress(code: string): boolean`, `initInput(): void`.
  - `settings.ts`: `settings: { invertY: boolean; muted: boolean }`, `toggleInvertY(): void`, `toggleMuted(): void`, `loadSettings(): void`.

- [ ] **Step 1: Write `src/entities/types.ts`**

```ts
export type { Vec3 } from '../math/projection';
export type { AABB, SweptBox } from '../math/collision';
import type { AABB } from '../math/collision';

export type ShipState =
  | { kind: 'alive' }
  | { kind: 'exploding'; t: number } // 0.8s, input locked
  | { kind: 'respawning'; t: number }; // 2s invulnerable, blink

export interface Ship extends AABB {
  state: ShipState;
  fuel: number; // 0–100
  lives: number;
  fireCooldown: number;
  bank: -1 | 0 | 1; // sprite tilt frame from lateral input
}

export interface Projectile extends AABB {
  yPrev: number;
  vy: number; // + for player, − for aimed enemy shots
  vx: number;
  vz: number;
  owner: 'player' | 'enemy';
  live: boolean; // pool flag
}

export type EntityKind =
  | 'fuelDrum'
  | 'turret'
  | 'radar'
  | 'missileLauncher'
  | 'parkedPlane'
  | 'wall'
  | 'barrier'
  | 'fighter'
  | 'missile'
  | 'boss'
  | 'bossCore'; // Zaxxon weak point (small AABB)

export interface Entity extends AABB {
  id: number;
  kind: EntityKind;
  hp: number;
  points: number;
  live: boolean; // spawner pool flag
  fireTimer: number; // turrets/fighters/boss cadence; 0 for static kinds
  vx: number; // fighters/missiles/airborne planes; 0 for static kinds
  vy: number;
  vz: number;
  wallHeight: number; // walls/barriers only; 0 otherwise (drives stripe rendering + altimeter ticks)
}

/** One row of levels/level1.json */
export interface Segment {
  type: EntityKind;
  y: number;
  x?: number;
  xStart?: number;
  xEnd?: number; // walls
  height?: number; // walls/barriers
}

export type GameMode =
  | { kind: 'attract' }
  | { kind: 'playing' }
  | { kind: 'paused' }
  | { kind: 'gameOver'; t: number }
  | { kind: 'highScoreEntry'; name: string };
```

`Entity` is deliberately flat (fixed slots, zeroed when unused) instead of a per-kind discriminated union: entities live in a preallocated pool and their fields are overwritten on spawn — a union would force allocation per spawn, violating the no-allocation constraint.

- [ ] **Step 2: Write `src/input.ts`**

```ts
const keys = new Set<string>();
const pressed = new Set<string>(); // edge-triggered, consumed once

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyP',
  'KeyI',
  'KeyM',
  'Enter',
]);

export function initInput(): void {
  addEventListener('keydown', (e) => {
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });
}

export const isDown = (code: string): boolean => keys.has(code);

/** One-shot press (pause, menu toggles). Sampled in fixed update, never in handlers. */
export function consumePress(code: string): boolean {
  const hit = pressed.has(code);
  if (hit) pressed.delete(code);
  return hit;
}
```

- [ ] **Step 3: Write `src/settings.ts`**

```ts
const KEY = 'zaxxon.settings.v1';

export const settings = { invertY: false, muted: false };

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s: unknown = JSON.parse(raw);
    if (typeof s === 'object' && s !== null) {
      const o = s as Record<string, unknown>;
      if (typeof o.invertY === 'boolean') settings.invertY = o.invertY;
      if (typeof o.muted === 'boolean') settings.muted = o.muted;
    }
  } catch {
    /* Safari private mode etc. — defaults stand */
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function toggleInvertY(): void {
  settings.invertY = !settings.invertY;
  save();
}

export function toggleMuted(): void {
  settings.muted = !settings.muted;
  save();
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/entities/types.ts src/input.ts src/settings.ts
git commit -m "feat: shared entity types, key-state input, persisted settings"
```

---

### Task 5: Fixed-timestep loop and bootstrap

**Files:**
- Create: `src/loop.ts`
- Modify: `src/main.ts` (replace stub)

**Interfaces:**
- Consumes: `initInput` (input.ts), `loadSettings` (settings.ts).
- Produces:
  - `loop.ts`: `startLoop(update: (dt: number) => void, render: (alpha: number) => void): void` — 60 Hz fixed update, clamped accumulator, `visibilitychange` pause.
  - `main.ts`: owns the canvas, a `Game` object (created in later tasks), and wires update/render into `startLoop`. Exposes nothing; it is the composition root.

- [ ] **Step 1: Write `src/loop.ts`**

```ts
export const DT = 1 / 60;

export function startLoop(update: (dt: number) => void, render: (alpha: number) => void): void {
  let acc = 0;
  let last = performance.now();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      last = performance.now(); // drop hidden time; accumulator stays paused
      acc = 0;
    }
  });

  function frame(now: number): void {
    if (!document.hidden) {
      acc += Math.min((now - last) / 1000, 0.25); // tab-switch spiral guard
      last = now;
      while (acc >= DT) {
        update(DT);
        acc -= DT;
      }
      render(acc / DT); // interpolation alpha
    } else {
      last = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Replace `src/main.ts`**

For now main proves the loop + canvas scaling; the game object arrives in Task 7 and the mode machine in Task 12.

```ts
import { startLoop } from './loop';
import { initInput } from './input';
import { loadSettings } from './settings';

export const VIEW_W = 480;
export const VIEW_H = 640;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no 2d context');
ctx.imageSmoothingEnabled = false;

function fitCanvas(): void {
  if (!canvas) return;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
addEventListener('resize', fitCanvas);
fitCanvas();

loadSettings();
initInput();

let t = 0;
startLoop(
  (dt) => {
    t += dt;
  },
  () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#0f0';
    ctx.fillText(`loop ok t=${t.toFixed(1)}`, 10, 20);
  },
);
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, open the printed URL.
Expected: black canvas, green `loop ok t=…` counting up smoothly; switch tabs for ~5 s and return — the counter must NOT jump forward (visibility pause works). Resize the window — canvas scales in integer steps.

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: exit 0.

```bash
git add src/loop.ts src/main.ts
git commit -m "feat: fixed-timestep loop with visibility pause and letterboxed canvas"
```

---

### Task 6: Procedural sprite atlas

**Files:**
- Create: `src/render/sprites.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `initAtlas(): Atlas`; `interface Atlas { draw(ctx: CanvasRenderingContext2D, name: SpriteName, frame: number, sx: number, sy: number): void; size(name: SpriteName): { w: number; h: number } }`; `type SpriteName = 'ship' | 'shadow' | 'turret' | 'radar' | 'fuelDrum' | 'launcher' | 'missile' | 'fighter' | 'plane' | 'boss' | 'bossCore' | 'explosion'`. Frames: `ship` 0/1/2 = bank left/level/right; `explosion` 0–3; all others frame 0. Sprites draw centered on `(sx, sy)` at 2× pixel scale.

- [ ] **Step 1: Write `src/render/sprites.ts`**

Sprites are defined as string grids (one char per pixel, `.` = transparent) rendered once into an offscreen canvas at boot. Grids are deliberately small and chunky — arcade-crude is the aesthetic; anyone can refine a grid later without touching the API.

```ts
export type SpriteName =
  | 'ship' | 'shadow' | 'turret' | 'radar' | 'fuelDrum' | 'launcher'
  | 'missile' | 'fighter' | 'plane' | 'boss' | 'bossCore' | 'explosion';

export interface Atlas {
  draw(ctx: CanvasRenderingContext2D, name: SpriteName, frame: number, sx: number, sy: number): void;
  size(name: SpriteName): { w: number; h: number };
}

const PAL: Record<string, string> = {
  W: '#e8e8e8', G: '#8a8a9a', D: '#4a4a5a', B: '#3050e0', C: '#70c8ff',
  R: '#e03030', O: '#ff9020', Y: '#ffe040', K: '#101018', E: '#20a040',
  S: 'rgba(0,0,0,0.45)',
};

// prettier-ignore
const GRIDS: Record<string, string[][]> = {
  ship: [
    [ // frame 0: banked left
      '.......B........',
      '......BBB.......',
      '..W..BCCB.......',
      '.WWWBBCCBB......',
      'WWWWWWWWWWWWG...',
      '.GGGWWWWWWGGGG..',
      '...GGGGGGGG.O...',
      '.....GGGG...O...',
    ],
    [ // frame 1: level
      '.......BB.......',
      '......BCCB......',
      '.....BBCCBB.....',
      'W...WWWWWWWW...W',
      'WWWWWWWWWWWWWWWW',
      '.GGGGWWWWWWGGGG.',
      '....GGGGGGGG....',
      '......GOOG......',
    ],
    [ // frame 2: banked right
      '........B.......',
      '.......BBB......',
      '.......BCCB..W..',
      '......BBCCBWWW..',
      '...GWWWWWWWWWWWW',
      '..GGGGWWWWWWGGG.',
      '...O.GGGGGGGG...',
      '...O...GGGG.....',
    ],
  ],
  turret: [[
    '....RR....',
    '....RR....',
    '..GGGGGG..',
    '.GGGGGGGG.',
    '.GDDDDDDG.',
    'GGGGGGGGGG',
    'KKKKKKKKKK',
  ]],
  radar: [[
    'CC......CC',
    '.CC....CC.',
    '..CCCCCC..',
    '...CCCC...',
    '....GG....',
    '....GG....',
    '..GGGGGG..',
    'KKKKKKKKKK',
  ]],
  fuelDrum: [[
    '.YYYYYY.',
    'YOOOOOOY',
    'YOYYYYOY',
    'YOYKKYOY',
    'YOYKKYOY',
    'YOYYYYOY',
    'YOOOOOOY',
    '.YYYYYY.',
  ]],
  launcher: [[
    '...RRRR...',
    '..RWWWWR..',
    '.GGGGGGGG.',
    'GGDDDDDDGG',
    'KKKKKKKKKK',
  ]],
  missile: [[
    '.RR.',
    'RWWR',
    'RWWR',
    'GGGG',
    'GGGG',
    '.OO.',
    'OYYO',
  ]],
  fighter: [[
    '......RR......',
    '.....RRRR.....',
    'R...RDDDDR...R',
    'RRRRRRRRRRRRRR',
    '.RRRRDDDDRRRR.',
    '....RR..RR....',
  ]],
  plane: [[
    '......GG......',
    '.....GGGG.....',
    'G...GDDDDG...G',
    'GGGGGGGGGGGGGG',
    '.GGGGDDDDGGGG.',
    '....GG..GG....',
  ]],
  boss: [[
    '....DDDDDDDD....',
    '...DGGGGGGGGD...',
    '..DGRR....RRGD..',
    '..DG..GGGG..GD..',
    '.DGG.GDDDDG.GGD.',
    '.DG..GDCCDG..GD.',
    '.DG..GDCCDG..GD.',
    '.DGG.GDDDDG.GGD.',
    '..DG..GGGG..GD..',
    '..DGGGGGGGGGGD..',
    '.DDKKDDDDDDKKDD.',
    'DDKKKKDDDDKKKKDD',
  ]],
  bossCore: [[
    '.RR.',
    'RYYR',
    'RYYR',
    '.RR.',
  ]],
  explosion: [
    ['....', '.YY.', '.YY.', '....'],
    ['..OO..', '.OYYO.', 'OYWWYO', 'OYWWYO', '.OYYO.', '..OO..'],
    ['.O..O.O.', 'O.OOOO.O', '.OYYYYO.', 'OOYWWYOO', 'OOYWWYOO', '.OYYYYO.', 'O.OOOO.O', '.O..O.O.'],
    ['O..O..O.', '........', '..O..O..', 'O.......', '......O.', '..O.....', '........', '.O..O..O'],
  ],
};

const SCALE = 2;

export function initAtlas(): Atlas {
  const entries = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }[]>();

  const renderGrid = (rows: string[]): HTMLCanvasElement => {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const c = document.createElement('canvas');
    c.width = w * SCALE;
    c.height = h * SCALE;
    const g = c.getContext('2d');
    if (!g) throw new Error('atlas ctx');
    for (let ry = 0; ry < h; ry++) {
      const row = rows[ry] ?? '';
      for (let rx = 0; rx < w; rx++) {
        const color = PAL[row[rx] ?? '.'];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(rx * SCALE, ry * SCALE, SCALE, SCALE);
      }
    }
    return c;
  };

  for (const [name, frames] of Object.entries(GRIDS)) {
    entries.set(name, frames.map((rows) => {
      const canvas = renderGrid(rows);
      return { canvas, w: canvas.width, h: canvas.height };
    }));
  }

  // shadow: soft ellipse, code-drawn (no grid)
  const sh = document.createElement('canvas');
  sh.width = 28;
  sh.height = 10;
  const sg = sh.getContext('2d');
  if (!sg) throw new Error('atlas ctx');
  sg.fillStyle = PAL.S ?? 'rgba(0,0,0,0.45)';
  sg.beginPath();
  sg.ellipse(14, 5, 13, 4, 0, 0, Math.PI * 2);
  sg.fill();
  entries.set('shadow', [{ canvas: sh, w: 28, h: 10 }]);

  return {
    draw(ctx, name, frame, sx, sy) {
      const frames = entries.get(name);
      const f = frames?.[Math.min(frame, (frames?.length ?? 1) - 1)];
      if (!f) return;
      ctx.drawImage(f.canvas, Math.round(sx - f.w / 2), Math.round(sy - f.h / 2));
    },
    size(name) {
      const f = entries.get(name)?.[0];
      return { w: f?.w ?? 0, h: f?.h ?? 0 };
    },
  };
}
```

Walls, barriers, and the floor are drawn as projected shapes by the renderer (Task 7/9), not sprites — their dimensions are world-derived and vary per segment.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expected: exit 0.

- [ ] **Step 3: Visual smoke test**

Temporarily add to `main.ts` render: `atlas.draw(ctx, 'ship', 1, 240, 320)` (import + `const atlas = initAtlas()` at boot). Run `npm run dev` — expected: the ship sprite centered on screen, crisp pixels. Remove the temporary line after checking.

- [ ] **Step 4: Commit**

```bash
git add src/render/sprites.ts
git commit -m "feat: procedural pixel-art sprite atlas"
```

---

### Task 7: Ship, shadow, floor renderer — first playable motion

**Files:**
- Create: `src/entities/ship.ts`, `src/world/shadow.ts`, `src/render/renderer.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Ship`, `Entity` (types), `isDown` (input), `settings`, `worldToScreen`/`depthKey`/`Vec3` (projection), `Atlas` (sprites).
- Produces:
  - `ship.ts`: `SCROLL_SPEED = 30`, `X_SPEED = 45`, `Z_SPEED = 40`, `X_MIN = 8`, `X_MAX = 92`, `Z_MIN = 8`, `Z_MAX = 90`, `SHIP_HW = 2.1` (≈70% of sprite), `SHIP_HD = 2`, `SHIP_HH = 1.4`; `createShip(): Ship`; `updateShip(ship: Ship, dt: number, scrollSpeed: number): void` (movement + clamps + bank + state timers; fuel handled in Task 11).
  - `shadow.ts`: `floorHeightAt(x: number, y: number, entities: readonly Entity[], hasFloor: boolean): number | null` — `null` = no floor (gap/space) → no shadow; wall tops count as floor.
  - `renderer.ts`: `createRenderer(ctx: CanvasRenderingContext2D, atlas: Atlas)` returning `{ render(world: RenderWorld, alpha: number): void }` with `interface RenderWorld { ship: Ship; entities: readonly Entity[]; projectiles: readonly Projectile[]; cameraY: number; hasFloor: boolean; floorGaps: readonly { yStart: number; yEnd: number }[] }` (projectiles empty until Task 8; gaps empty until Task 9).

- [ ] **Step 1: Write `src/entities/ship.ts`**

```ts
import type { Ship } from './types';
import { isDown } from '../input';
import { settings } from '../settings';

export const SCROLL_SPEED = 30; // world y-units/sec, base tier
export const X_SPEED = 45;
export const Z_SPEED = 40;
export const X_MIN = 8;
export const X_MAX = 92;
export const Z_MIN = 8;
export const Z_MAX = 90;
export const SHIP_HW = 2.1; // ≈70% of visual half-width (shmup courtesy)
export const SHIP_HD = 2;
export const SHIP_HH = 1.4;
export const EXPLODE_TIME = 0.8;
export const RESPAWN_TIME = 2.0;

export function createShip(): Ship {
  return {
    x: 50, y: 0, z: 50,
    hw: SHIP_HW, hd: SHIP_HD, hh: SHIP_HH,
    state: { kind: 'alive' },
    fuel: 100,
    lives: 3,
    fireCooldown: 0,
    bank: 0,
  };
}

export function updateShip(ship: Ship, dt: number, scrollSpeed: number): void {
  // state timers
  if (ship.state.kind === 'exploding') {
    ship.state.t -= dt;
    if (ship.state.t <= 0) ship.state = { kind: 'respawning', t: RESPAWN_TIME };
    return; // input locked; no forward motion while exploding
  }
  if (ship.state.kind === 'respawning') {
    ship.state.t -= dt;
    if (ship.state.t <= 0) ship.state = { kind: 'alive' };
  }

  ship.y += scrollSpeed * dt; // world scroll: the ship advances, never the map

  const dx = (isDown('ArrowRight') ? 1 : 0) - (isDown('ArrowLeft') ? 1 : 0);
  // authentic default: up = dive (z down); settings.invertY flips
  let dz = (isDown('ArrowDown') ? 1 : 0) - (isDown('ArrowUp') ? 1 : 0);
  if (settings.invertY) dz = -dz;

  ship.x = Math.min(X_MAX, Math.max(X_MIN, ship.x + dx * X_SPEED * dt));
  ship.z = Math.min(Z_MAX, Math.max(Z_MIN, ship.z + dz * Z_SPEED * dt));
  ship.bank = dx as -1 | 0 | 1;

  if (ship.fireCooldown > 0) ship.fireCooldown -= dt;
}

/** Death entry point used by the collision pass (Task 9). */
export function killShip(ship: Ship): void {
  if (ship.state.kind !== 'alive') return;
  ship.state = { kind: 'exploding', t: EXPLODE_TIME };
  ship.lives -= 1;
  ship.x = 50;
  ship.z = 50; // y is NOT rewound (spec §3.3)
}
```

- [ ] **Step 2: Write `src/world/shadow.ts`**

```ts
import type { Entity } from '../entities/types';

/**
 * Height of whatever is directly under (x, y): wall/barrier tops count,
 * otherwise the floor plane (0). Returns null when there is nothing below
 * (open space in phase 2, or a floor gap) — the shadow must vanish.
 */
export function floorHeightAt(
  x: number,
  y: number,
  entities: readonly Entity[],
  hasFloor: boolean,
  floorGaps: readonly { yStart: number; yEnd: number }[] = [],
): number | null {
  let top: number | null = hasFloor ? 0 : null;
  for (const gap of floorGaps) {
    if (y > gap.yStart && y < gap.yEnd) top = null;
  }
  for (const e of entities) {
    if (!e.live || e.kind !== 'wall') continue;
    if (Math.abs(x - e.x) < e.hw && Math.abs(y - e.y) < e.hd) {
      if (top === null || e.wallHeight > top) top = e.wallHeight;
    }
  }
  return top;
}
```

- [ ] **Step 3: Write `src/render/renderer.ts`**

```ts
import type { Entity, Projectile, Ship, Vec3 } from '../entities/types';
import { worldToScreen, depthKey, Z_SCALE } from '../math/projection';
import type { Atlas, SpriteName } from './sprites';
import { floorHeightAt } from '../world/shadow';

export const VIEW_W = 480;
export const VIEW_H = 640;
export const ORIGIN = { x: VIEW_W / 2 + 140, y: 150 }; // tuned so corridor x∈[0,100] spans the view

export interface RenderWorld {
  ship: Ship;
  entities: readonly Entity[];
  projectiles: readonly Projectile[];
  cameraY: number;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
}

const KIND_SPRITE: Partial<Record<Entity['kind'], SpriteName>> = {
  fuelDrum: 'fuelDrum', turret: 'turret', radar: 'radar', missileLauncher: 'launcher',
  parkedPlane: 'plane', fighter: 'fighter', missile: 'missile', boss: 'boss', bossCore: 'bossCore',
};

// Preallocated sort scratch (no allocation in render): index + key pairs.
interface DrawItem { key: number; id: number; draw: () => void }

export function createRenderer(ctx: CanvasRenderingContext2D, atlas: Atlas) {
  const items: DrawItem[] = [];
  const p = { x: 0, y: 0, z: 0 }; // scratch Vec3

  function project(v: Vec3, cameraY: number) {
    return worldToScreen(v, cameraY, ORIGIN);
  }

  function drawFloor(cameraY: number, hasFloor: boolean, gaps: RenderWorld['floorGaps']): void {
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!hasFloor) return drawStars(cameraY);
    const y0 = Math.floor((cameraY - 20) / 10) * 10;
    for (let wy = y0; wy < cameraY + 90; wy += 10) {
      const inGap = gaps.some((g) => wy + 5 > g.yStart && wy + 5 < g.yEnd);
      if (inGap) continue;
      for (let wx = 0; wx < 100; wx += 10) {
        p.x = wx; p.y = wy; p.z = 0;
        const a = project(p, cameraY);
        const even = ((wx + wy) / 10) % 2 === 0;
        ctx.fillStyle = even ? '#182838' : '#142030';
        // 10×10 world tile as a screen parallelogram
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + 5 * 16, a.sy + 5 * 8);        // +x edge
        ctx.lineTo(a.sx + 5 * 16 - 5 * 16, a.sy + 5 * 8 + 5 * 8); // +y edge
        ctx.lineTo(a.sx - 5 * 16, a.sy + 5 * 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawStars(cameraY: number): void {
    ctx.fillStyle = '#cfd8ff';
    for (let i = 0; i < 60; i++) {
      // deterministic star field scrolled by cameraY (no RNG in render)
      const sx = (i * 97) % VIEW_W;
      const sy = (i * 211 + Math.floor(cameraY * 4)) % VIEW_H;
      ctx.fillRect(sx, (VIEW_H - sy) % VIEW_H, 2, 2);
    }
  }

  return {
    render(w: RenderWorld, _alpha: number): void {
      items.length = 0;
      drawFloor(w.cameraY, w.hasFloor, w.floorGaps);

      // shadow (above floor, below everything else — drawn before sorted pass)
      const fh = floorHeightAt(w.ship.x, w.ship.y, w.entities, w.hasFloor, w.floorGaps);
      if (fh !== null && w.ship.state.kind !== 'exploding') {
        p.x = w.ship.x; p.y = w.ship.y; p.z = fh;
        const s = project(p, w.cameraY);
        atlas.draw(ctx, 'shadow', 0, s.sx, s.sy);
      }

      for (const e of w.entities) {
        if (!e.live) continue;
        if (e.kind === 'wall' || e.kind === 'barrier') {
          items.push({ key: depthKey(e), id: e.id, draw: () => drawWall(e, w.cameraY) });
        } else {
          const sprite = KIND_SPRITE[e.kind];
          if (!sprite) continue;
          items.push({ key: depthKey(e), id: e.id, draw: () => {
            const s = project(e, w.cameraY);
            atlas.draw(ctx, sprite, 0, s.sx, s.sy);
          }});
        }
      }

      const ship = w.ship;
      if (ship.state.kind !== 'exploding') {
        const blink = ship.state.kind === 'respawning' && Math.floor(ship.state.t * 10) % 2 === 0;
        if (!blink) {
          items.push({ key: depthKey(ship), id: -1, draw: () => {
            const s = project(ship, w.cameraY);
            atlas.draw(ctx, 'ship', ship.bank + 1, s.sx, s.sy);
          }});
        }
      } else {
        const frame = Math.min(3, Math.floor((0.8 - ship.state.t) / 0.2));
        items.push({ key: depthKey(ship), id: -1, draw: () => {
          const s = project(ship, w.cameraY);
          atlas.draw(ctx, 'explosion', frame, s.sx, s.sy);
        }});
      }

      for (const pr of w.projectiles) {
        if (!pr.live) continue;
        items.push({ key: depthKey(pr), id: 100000, draw: () => {
          const s = project(pr, w.cameraY);
          ctx.fillStyle = pr.owner === 'player' ? '#80ffff' : '#ff6060';
          ctx.fillRect(s.sx - 2, s.sy - 4, 4, 8);
        }});
      }

      items.sort((a, b) => a.key - b.key || a.id - b.id);
      for (const it of items) it.draw();
    },
  };

  function drawWall(e: Entity, cameraY: number): void {
    // leading (near) face: projected quad from floor to wallHeight along the x span
    const h = e.wallHeight;
    const yFace = e.y - e.hd;
    const L = { x: e.x - e.hw, y: yFace, z: 0 };
    const R = { x: e.x + e.hw, y: yFace, z: 0 };
    const bl = project(L, cameraY);
    const br = project(R, cameraY);
    const zPix = h * Z_SCALE;
    if (e.kind === 'barrier') {
      ctx.fillStyle = 'rgba(80,220,255,0.55)';
      const zLo = (e.z - e.hh) * Z_SCALE;
      const zHi = (e.z + e.hh) * Z_SCALE;
      ctx.beginPath();
      ctx.moveTo(bl.sx, bl.sy - zLo); ctx.lineTo(br.sx, br.sy - zLo);
      ctx.lineTo(br.sx, br.sy - zHi); ctx.lineTo(bl.sx, bl.sy - zHi);
      ctx.closePath(); ctx.fill();
      return;
    }
    // face
    ctx.fillStyle = '#5a5a72';
    ctx.beginPath();
    ctx.moveTo(bl.sx, bl.sy); ctx.lineTo(br.sx, br.sy);
    ctx.lineTo(br.sx, br.sy - zPix); ctx.lineTo(bl.sx, bl.sy - zPix);
    ctx.closePath(); ctx.fill();
    // top slab
    const TL = { x: e.x - e.hw, y: e.y + e.hd, z: h };
    const TR = { x: e.x + e.hw, y: e.y + e.hd, z: h };
    const tl = project(TL, cameraY);
    const tr = project(TR, cameraY);
    ctx.fillStyle = '#78788f';
    ctx.beginPath();
    ctx.moveTo(bl.sx, bl.sy - zPix); ctx.lineTo(br.sx, br.sy - zPix);
    ctx.lineTo(tr.sx, tr.sy); ctx.lineTo(tl.sx, tl.sy);
    ctx.closePath(); ctx.fill();
    // altitude stripes every 10 z-units on the face (spec §4 wall height markers)
    ctx.strokeStyle = '#b8b8d0';
    ctx.lineWidth = 1;
    for (let sz = 10; sz < h; sz += 10) {
      ctx.beginPath();
      ctx.moveTo(bl.sx, bl.sy - sz * Z_SCALE);
      ctx.lineTo(br.sx, br.sy - sz * Z_SCALE);
      ctx.stroke();
    }
  }
}
```

Note the closures pushed into `items` — those arrow functions are per-frame allocations, which is acceptable in `render()` (the constraint is on `update()`); if profiling ever shows GC pressure, convert to a preallocated struct-of-arrays, but do not do that preemptively.

- [ ] **Step 4: Wire into `src/main.ts`**

Replace the placeholder update/render with a minimal world:

```ts
import { startLoop } from './loop';
import { initInput } from './input';
import { loadSettings } from './settings';
import { initAtlas } from './render/sprites';
import { createRenderer, VIEW_W, VIEW_H } from './render/renderer';
import { createShip, updateShip, SCROLL_SPEED } from './entities/ship';
import type { Entity, Projectile } from './entities/types';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no 2d context');
ctx.imageSmoothingEnabled = false;

function fitCanvas(): void {
  if (!canvas) return;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
addEventListener('resize', fitCanvas);
fitCanvas();

loadSettings();
initInput();

const atlas = initAtlas();
const renderer = createRenderer(ctx, atlas);
const ship = createShip();
const entities: Entity[] = [];
const projectiles: Projectile[] = [];
let cameraY = 0;

startLoop(
  (dt) => {
    updateShip(ship, dt, SCROLL_SPEED);
    cameraY = ship.y;
  },
  (alpha) => {
    renderer.render(
      { ship, entities, projectiles, cameraY, hasFloor: true, floorGaps: [] },
      alpha,
    );
  },
);
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`. Expected: checkerboard floor scrolling toward the camera; arrow keys move the ship (left/right slides with bank tilt frames, up dives / down climbs by default); the shadow stays glued to the ship's x and the ship–shadow gap grows with altitude; ship cannot leave x∈[8,92], z∈[8,90].

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint` — expected: exit 0.

```bash
git add src/entities/ship.ts src/world/shadow.ts src/render/renderer.ts src/main.ts
git commit -m "feat: ship movement, floor renderer, and shadow depth cue"
```

---

### Task 8: Pooled projectiles and player cannon

**Files:**
- Create: `src/entities/projectiles.ts`
- Modify: `src/main.ts` (fire input + pool update in the loop)

**Interfaces:**
- Consumes: `Projectile`, `Ship` (types), `isDown` (input), `SCROLL_SPEED` (ship).
- Produces: `PLAYER_POOL = 8`, `ENEMY_POOL = 32`, `MAX_PLAYER_LIVE = 4`, `FIRE_INTERVAL = 0.25`, `PROJ_SPEED = SCROLL_SPEED * 3`, `PROJ_RANGE = 120`; `createPools(): Pools` where `interface Pools { player: Projectile[]; enemy: Projectile[] }`; `firePlayer(pools: Pools, ship: Ship): boolean`; `fireEnemy(pools: Pools, from: Vec3, vx: number, vy: number, vz: number): void`; `updateProjectiles(pools: Pools, dt: number, cameraY: number): void`.

- [ ] **Step 1: Write `src/entities/projectiles.ts`**

```ts
import type { Projectile, Ship, Vec3 } from './types';
import { SCROLL_SPEED } from './ship';

export const PLAYER_POOL = 8;
export const ENEMY_POOL = 32;
export const MAX_PLAYER_LIVE = 4; // the real difficulty knob for turret duels
export const FIRE_INTERVAL = 0.25; // ≈4 shots/sec autofire
export const PROJ_SPEED = SCROLL_SPEED * 3;
export const PROJ_RANGE = 120; // y-units before despawn

export interface Pools {
  player: Projectile[];
  enemy: Projectile[];
}

function blank(owner: 'player' | 'enemy'): Projectile {
  return {
    x: 0, y: 0, z: 0, yPrev: 0,
    hw: 0.6, hd: 0.8, hh: 0.6,
    vx: 0, vy: 0, vz: 0,
    owner, live: false,
  };
}

export function createPools(): Pools {
  return {
    player: Array.from({ length: PLAYER_POOL }, () => blank('player')),
    enemy: Array.from({ length: ENEMY_POOL }, () => blank('enemy')),
  };
}

function liveCount(pool: readonly Projectile[]): number {
  let n = 0;
  for (const p of pool) if (p.live) n++;
  return n;
}

/** Returns true if a shot was fired (for SFX + cooldown reset by the caller). */
export function firePlayer(pools: Pools, ship: Ship): boolean {
  if (ship.state.kind !== 'alive') return false;
  if (ship.fireCooldown > 0) return false;
  if (liveCount(pools.player) >= MAX_PLAYER_LIVE) return false;
  for (const p of pools.player) {
    if (p.live) continue;
    p.x = ship.x;
    p.y = ship.y + ship.hd; // nose
    p.yPrev = p.y;
    p.z = ship.z;
    p.vx = 0; p.vy = PROJ_SPEED; p.vz = 0;
    p.live = true;
    ship.fireCooldown = FIRE_INTERVAL;
    return true;
  }
  return false;
}

export function fireEnemy(pools: Pools, from: Vec3, vx: number, vy: number, vz: number): void {
  for (const p of pools.enemy) {
    if (p.live) continue;
    p.x = from.x; p.y = from.y; p.yPrev = from.y; p.z = from.z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.live = true;
    return;
  } // pool exhausted: drop the shot (32 is generous; never allocate)
}

export function updateProjectiles(pools: Pools, dt: number, cameraY: number): void {
  for (const pool of [pools.player, pools.enemy]) {
    for (const p of pool) {
      if (!p.live) continue;
      p.yPrev = p.y; // MUST precede advancement (swept test, spec §5.3)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const range = p.owner === 'player' ? p.y - cameraY > PROJ_RANGE : false;
      const behind = p.y < cameraY - 20;
      const grounded = p.z < 0;
      if (range || behind || grounded) p.live = false;
    }
  }
}
```

- [ ] **Step 2: Wire firing into `src/main.ts`**

In the update callback, after `updateShip(...)`:

```ts
import { createPools, firePlayer, updateProjectiles } from './entities/projectiles';
import { isDown } from './input';
// boot:
const pools = createPools();
// update, after updateShip:
if (isDown('Space')) firePlayer(pools, ship);
updateProjectiles(pools, dt, cameraY);
```

and pass `projectiles: [...]`? No — pass the pools without allocating: change the `RenderWorld` wiring to `projectiles: pools.player` plus a second field. Simplest no-allocation approach: renderer accepts the pools object. Update `RenderWorld` in `renderer.ts`:

```ts
// renderer.ts — replace the projectiles field:
export interface RenderWorld {
  ship: Ship;
  entities: readonly Entity[];
  playerShots: readonly Projectile[];
  enemyShots: readonly Projectile[];
  cameraY: number;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
}
```

and iterate both arrays in the projectile draw loop. In `main.ts`, pass `playerShots: pools.player, enemyShots: pools.enemy`.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. Expected: holding Space streams cyan bolts from the ship nose at ~4/s, never more than 4 on screen; bolts vanish ~120 units ahead.

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: exit 0.

```bash
git add src/entities/projectiles.ts src/render/renderer.ts src/main.ts
git commit -m "feat: pooled projectiles with 4-shot player cannon"
```

---

### Task 9: Level data, spawner, collision pass — walls can kill

**Files:**
- Create: `src/levels/level1.json`, `src/world/spawner.ts`, `src/game.ts`
- Modify: `src/main.ts` (delegate update to `game.ts`)
- Test: `tests/spawner.test.ts`

**Interfaces:**
- Consumes: `Segment`, `Entity`, `Ship` (types), `overlap`/`projectileHit`/`wallAABB` (collision), `killShip` (ship), `Pools` (projectiles).
- Produces:
  - `spawner.ts`: `SPAWN_LOOKAHEAD = 90`, `DESPAWN_MARGIN = 25`, `ENTITY_POOL = 64`; `createSpawner(segments: readonly Segment[]): Spawner`; `interface Spawner { update(cameraY: number): void; entities: readonly Entity[]; reset(): void }`.
  - `game.ts`: `createGame(): Game`; `interface Game { update(dt: number): void; ship: Ship; spawner: Spawner; pools: Pools; cameraY: number; score: number; hasFloor: boolean; floorGaps: readonly { yStart: number; yEnd: number }[] }` — owns the §11 update order and the §5.4 collision priority. This is the composition point every later task extends.
  - `level1.json` top-level shape: `{ "floorGaps": [{ "yStart": number, "yEnd": number }], "segments": Segment[] }`.

- [ ] **Step 1: Write the failing spawner test**

`tests/spawner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSpawner, SPAWN_LOOKAHEAD, DESPAWN_MARGIN } from '../src/world/spawner';
import type { Segment } from '../src/entities/types';

const segs: Segment[] = [
  { type: 'fuelDrum', y: 200, x: 30 },
  { type: 'wall', y: 300, xStart: 0, xEnd: 100, height: 40 },
];

describe('spawner', () => {
  it('spawns a segment only once cameraY + lookahead reaches its y', () => {
    const s = createSpawner(segs);
    s.update(200 - SPAWN_LOOKAHEAD - 1);
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
    s.update(200 - SPAWN_LOOKAHEAD + 1);
    const live = s.entities.filter((e) => e.live);
    expect(live).toHaveLength(1);
    expect(live[0]?.kind).toBe('fuelDrum');
  });

  it('despawns entities behind the camera', () => {
    const s = createSpawner(segs);
    s.update(300); // both spawned
    s.update(300 + DESPAWN_MARGIN + 10);
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
  });

  it('builds wall AABBs from xStart/xEnd/height', () => {
    const s = createSpawner(segs);
    s.update(300);
    const wall = s.entities.find((e) => e.live && e.kind === 'wall');
    expect(wall).toBeDefined();
    expect(wall?.z).toBe(20);
    expect(wall?.hh).toBe(20);
    expect(wall?.wallHeight).toBe(40);
  });

  it('reset() rewinds so a new loop replays the level', () => {
    const s = createSpawner(segs);
    s.update(300);
    s.reset();
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
    s.update(200);
    expect(s.entities.filter((e) => e.live && e.kind === 'fuelDrum')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/spawner.test.ts`
Expected: FAIL — cannot resolve `../src/world/spawner`.

- [ ] **Step 3: Write `src/world/spawner.ts`**

```ts
import type { Entity, Segment } from '../entities/types';
import { wallAABB } from '../math/collision';

export const SPAWN_LOOKAHEAD = 90;
export const DESPAWN_MARGIN = 25;
export const ENTITY_POOL = 64;

interface KindDef { hw: number; hd: number; hh: number; hp: number; points: number }
const DEFS: Record<string, KindDef> = {
  fuelDrum:        { hw: 2.5, hd: 2.5, hh: 3,   hp: 1, points: 50 },
  turret:          { hw: 3,   hd: 3,   hh: 3,   hp: 1, points: 200 },
  radar:           { hw: 3,   hd: 3,   hh: 4,   hp: 1, points: 100 },
  missileLauncher: { hw: 3.5, hd: 3,   hh: 2.5, hp: 1, points: 300 },
  parkedPlane:     { hw: 4,   hd: 4,   hh: 2,   hp: 1, points: 100 },
  fighter:         { hw: 3.5, hd: 3,   hh: 1.5, hp: 1, points: 200 },
  missile:         { hw: 1,   hd: 2,   hh: 1,   hp: 1, points: 150 },
};

export interface Spawner {
  update(cameraY: number): void;
  entities: readonly Entity[];
  spawn(kind: Entity['kind'], x: number, y: number, z: number): Entity | null;
  reset(): void;
}

function blankEntity(): Entity {
  return {
    id: 0, kind: 'fuelDrum', x: 0, y: 0, z: 0, hw: 1, hd: 1, hh: 1,
    hp: 0, points: 0, live: false, fireTimer: 0, vx: 0, vy: 0, vz: 0, wallHeight: 0,
  };
}

export function createSpawner(segments: readonly Segment[]): Spawner {
  const pool: Entity[] = Array.from({ length: ENTITY_POOL }, blankEntity);
  let cursor = 0; // next segment index to consider (segments must be sorted by y)
  let nextId = 1;
  const sorted = [...segments].sort((a, b) => a.y - b.y);

  function take(): Entity | null {
    for (const e of pool) if (!e.live) return e;
    return null; // pool exhausted — skip spawn rather than allocate
  }

  function spawnSegment(seg: Segment): void {
    const e = take();
    if (!e) return;
    e.id = nextId++;
    e.kind = seg.type;
    e.live = true;
    e.fireTimer = 0;
    e.vx = 0; e.vy = 0; e.vz = 0;
    e.wallHeight = 0;
    if (seg.type === 'wall' || seg.type === 'barrier') {
      const box = wallAABB(seg.xStart ?? 0, seg.xEnd ?? 100, seg.y, seg.height ?? 30);
      Object.assign(e, box);
      e.wallHeight = seg.height ?? 30;
      if (seg.type === 'barrier') {
        // force-field band at fixed z: fly under or over (spec §8)
        e.z = seg.height ?? 30;
        e.hh = 4;
      }
      e.hp = Infinity;
      e.points = 0;
    } else {
      const def = DEFS[seg.type];
      if (!def) return void (e.live = false);
      e.x = seg.x ?? 50;
      e.y = seg.y;
      e.z = seg.type === 'turret' || seg.type === 'radar' ? (seg.height ?? 0) + def.hh : def.hh;
      e.hw = def.hw; e.hd = def.hd; e.hh = def.hh;
      e.hp = def.hp;
      e.points = def.points;
    }
  }

  return {
    entities: pool,
    update(cameraY: number): void {
      while (cursor < sorted.length) {
        const seg = sorted[cursor];
        if (!seg || seg.y > cameraY + SPAWN_LOOKAHEAD) break;
        spawnSegment(seg);
        cursor++;
      }
      for (const e of pool) {
        if (e.live && e.y + e.hd < cameraY - DESPAWN_MARGIN) e.live = false;
      }
    },
    spawn(kind, x, y, z): Entity | null {
      const e = take();
      if (!e) return null;
      const def = DEFS[kind] ?? { hw: 2, hd: 2, hh: 2, hp: 1, points: 0 };
      e.id = nextId++;
      e.kind = kind; e.live = true;
      e.x = x; e.y = y; e.z = z;
      e.hw = def.hw; e.hd = def.hd; e.hh = def.hh;
      e.hp = def.hp; e.points = def.points;
      e.fireTimer = 0; e.vx = 0; e.vy = 0; e.vz = 0; e.wallHeight = 0;
      return e;
    },
    reset(): void {
      cursor = 0;
      for (const e of pool) e.live = false;
    },
  };
}
```

(`turret`/`radar` accept an optional `height` in their segment = the wall-top they sit on, per spec §8 "Floor or wall-top".)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/spawner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `src/levels/level1.json` (phase 1 only for now)**

Phase 1 spans y 0–2000: a teaching ramp (low lone walls, drums) into slots, barriers, turret clusters, launchers. Full file — later tasks only *read* it; Task 12 appends phases 2–3 data:

```json
{
  "floorGaps": [
    { "yStart": 1180, "yEnd": 1240 }
  ],
  "segments": [
    { "type": "fuelDrum", "y": 120, "x": 40 },
    { "type": "fuelDrum", "y": 140, "x": 60 },
    { "type": "wall", "y": 220, "xStart": 0, "xEnd": 100, "height": 20 },
    { "type": "radar", "y": 300, "x": 25 },
    { "type": "fuelDrum", "y": 340, "x": 70 },
    { "type": "wall", "y": 420, "xStart": 0, "xEnd": 100, "height": 35 },
    { "type": "turret", "y": 500, "x": 50 },
    { "type": "fuelDrum", "y": 560, "x": 20 },
    { "type": "wall", "y": 640, "xStart": 0, "xEnd": 45, "height": 45 },
    { "type": "wall", "y": 640, "xStart": 62, "xEnd": 100, "height": 45 },
    { "type": "turret", "y": 730, "x": 30 },
    { "type": "turret", "y": 760, "x": 70 },
    { "type": "radar", "y": 800, "x": 55 },
    { "type": "barrier", "y": 880, "xStart": 0, "xEnd": 100, "height": 45 },
    { "type": "fuelDrum", "y": 940, "x": 50 },
    { "type": "missileLauncher", "y": 1020, "x": 35 },
    { "type": "wall", "y": 1100, "xStart": 0, "xEnd": 100, "height": 55 },
    { "type": "turret", "y": 1100, "x": 50, "height": 55 },
    { "type": "fuelDrum", "y": 1300, "x": 45 },
    { "type": "fuelDrum", "y": 1310, "x": 62 },
    { "type": "parkedPlane", "y": 1380, "x": 25 },
    { "type": "parkedPlane", "y": 1400, "x": 75 },
    { "type": "wall", "y": 1480, "xStart": 0, "xEnd": 38, "height": 60 },
    { "type": "wall", "y": 1480, "xStart": 54, "xEnd": 100, "height": 60 },
    { "type": "missileLauncher", "y": 1560, "x": 60 },
    { "type": "turret", "y": 1620, "x": 20 },
    { "type": "turret", "y": 1640, "x": 80 },
    { "type": "barrier", "y": 1720, "xStart": 0, "xEnd": 100, "height": 25 },
    { "type": "wall", "y": 1800, "xStart": 30, "xEnd": 100, "height": 70 },
    { "type": "radar", "y": 1800, "x": 65, "height": 70 },
    { "type": "fuelDrum", "y": 1900, "x": 50 },
    { "type": "wall", "y": 1960, "xStart": 0, "xEnd": 100, "height": 30 }
  ]
}
```

- [ ] **Step 6: Write `src/game.ts` (update order §11 + collision priority §5.4)**

```ts
import type { Entity, Ship } from './entities/types';
import { createShip, updateShip, killShip, SCROLL_SPEED } from './entities/ship';
import { createPools, firePlayer, updateProjectiles, type Pools } from './entities/projectiles';
import { createSpawner, type Spawner } from './world/spawner';
import { overlap, projectileHit } from './math/collision';
import { isDown } from './input';
import level1 from './levels/level1.json';
import type { Segment } from './entities/types';

export interface Game {
  ship: Ship;
  spawner: Spawner;
  pools: Pools;
  cameraY: number;
  score: number;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
  update(dt: number): void;
}

export function createGame(): Game {
  const ship = createShip();
  const pools = createPools();
  const spawner = createSpawner(level1.segments as Segment[]);

  const game: Game = {
    ship,
    spawner,
    pools,
    cameraY: 0,
    score: 0,
    hasFloor: true,
    floorGaps: level1.floorGaps,

    update(dt: number): void {
      // §11 order: input is sampled inside the helpers below
      updateShip(ship, dt, SCROLL_SPEED);            // 2+3: scroll via ship.y, movement, clamps
      game.cameraY = ship.y;
      spawner.update(game.cameraY);                  // 4: spawn/despawn window
      // 5: entity AI — Task 10
      if (isDown('Space')) firePlayer(pools, ship);  // 6a
      updateProjectiles(pools, dt, game.cameraY);    // 6b: records yPrev first
      collide(game);                                 // 7: §5.4 priority
      // 8: deaths/phase transitions — extended in Tasks 10/12
      // 9: shadow is a pure lookup at render time
    },
  };
  return game;
}

function collide(game: Game): void {
  const { ship, spawner, pools } = game;
  const shipAlive = ship.state.kind === 'alive';

  // 1. player vs walls/terrain, 2. player vs enemy entities
  if (shipAlive) {
    for (const e of spawner.entities) {
      if (!e.live) continue;
      if (overlap(ship, e)) {
        if (e.kind !== 'wall' && e.kind !== 'barrier') {
          e.live = false; // both die (spec §5.4-2)
        }
        killShip(ship);
        break;
      }
    }
  }

  // 3. player vs enemy projectiles
  if (ship.state.kind === 'alive') {
    for (const p of pools.enemy) {
      if (p.live && projectileHit(p, ship)) {
        p.live = false;
        killShip(ship);
        break;
      }
    }
  }

  // 4. player projectiles vs targets, 5. vs walls
  for (const p of pools.player) {
    if (!p.live) continue;
    for (const e of spawner.entities) {
      if (!e.live) continue;
      if (projectileHit(p, e)) {
        p.live = false;
        if (e.kind === 'wall' || e.kind === 'barrier') break; // walls block shots
        e.hp -= 1;
        if (e.hp <= 0) {
          e.live = false;
          game.score += e.points;
          onKill(game, e);
        }
        break;
      }
    }
  }
}

/** Kill hooks (fuel pickup, missile scoring, boss) grow in later tasks. */
function onKill(_game: Game, _e: Entity): void {}
```

- [ ] **Step 7: Slim `src/main.ts` to a composition root**

```ts
import { startLoop } from './loop';
import { initInput } from './input';
import { loadSettings } from './settings';
import { initAtlas } from './render/sprites';
import { createRenderer, VIEW_W, VIEW_H } from './render/renderer';
import { createGame } from './game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no 2d context');
ctx.imageSmoothingEnabled = false;

function fitCanvas(): void {
  if (!canvas) return;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
addEventListener('resize', fitCanvas);
fitCanvas();

loadSettings();
initInput();

const atlas = initAtlas();
const renderer = createRenderer(ctx, atlas);
const game = createGame();

startLoop(
  (dt) => game.update(dt),
  (alpha) =>
    renderer.render(
      {
        ship: game.ship,
        entities: game.spawner.entities,
        playerShots: game.pools.player,
        enemyShots: game.pools.enemy,
        cameraY: game.cameraY,
        hasFloor: game.hasFloor,
        floorGaps: game.floorGaps,
      },
      alpha,
    ),
);
```

- [ ] **Step 8: Run all tests, verify manually**

Run: `npx vitest run` — expected: projection + collision + spawner suites all PASS.
Run: `npm run dev` — expected: walls rise from the floor with stripe markers and kill on contact below their height, clear above; the slot at y=640 is flyable through the gap; barriers can be flown under or over; shooting a drum/turret/radar destroys it; walls stop your shots; ship explodes → respawns blinking at x=50/z=50 without rewinding forward progress; shadow vanishes over the floor gap at y≈1200.

- [ ] **Step 9: Commit**

```bash
git add src/levels/level1.json src/world/spawner.ts src/game.ts src/main.ts tests/spawner.test.ts
git commit -m "feat: data-driven level spawner and full collision pass"
```

---

### Task 10: Enemy AI — turrets, homing missiles, fighters, planes

**Files:**
- Create: `src/entities/enemies.ts`
- Modify: `src/game.ts` (call `updateEnemies` at §11 step 5; extend `onKill`)

**Interfaces:**
- Consumes: `Entity`, `Ship` (types), `Pools`/`fireEnemy` (projectiles), `Spawner.spawn` (spawner), `SCROLL_SPEED` (ship).
- Produces: `updateEnemies(entities: readonly Entity[], ship: Ship, pools: Pools, spawner: Spawner, dt: number, tier: DifficultyTier): void`; `interface DifficultyTier { fireRateMul: number; shotSpeedMul: number; planesActive: boolean }` (Task 15 supplies real values; until then game.ts passes `{ fireRateMul: 1, shotSpeedMul: 1, planesActive: false }` stored as a constant, not a per-frame literal).

- [ ] **Step 1: Write `src/entities/enemies.ts`**

```ts
import type { Entity, Ship } from './types';
import { fireEnemy, type Pools } from './projectiles';
import type { Spawner } from '../world/spawner';

export interface DifficultyTier {
  fireRateMul: number;
  shotSpeedMul: number;
  planesActive: boolean;
}

const TURRET_RANGE = 70;       // y-units: fire only when player is this close
const TURRET_INTERVAL = 1.6;   // seconds between aimed shots, tier 1
const TURRET_SHOT_SPEED = 55;  // world units/sec along the aim vector
const MISSILE_TRIGGER = 60;    // launcher fires when player within this y
const MISSILE_SPEED = 45;      // toward player, -y
const MISSILE_TURN = 30;       // max lateral/vertical steer units/sec²-ish cap
const FIGHTER_SPEED = 38;      // convergence speed on (x, z)
const FIGHTER_INTERVAL = 2.2;
const PLANE_TAKEOFF_RANGE = 55;

export function updateEnemies(
  entities: readonly Entity[],
  ship: Ship,
  pools: Pools,
  spawner: Spawner,
  dt: number,
  tier: DifficultyTier,
): void {
  for (const e of entities) {
    if (!e.live) continue;
    switch (e.kind) {
      case 'turret': {
        const dy = e.y - ship.y;
        if (dy < 5 || dy > TURRET_RANGE) break; // only ahead of player, in range
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = TURRET_INTERVAL / tier.fireRateMul;
          // aimed shot: unit vector from turret to ship, scaled
          const dx = ship.x - e.x;
          const dyv = ship.y - e.y;
          const dz = ship.z - e.z;
          const len = Math.hypot(dx, dyv, dz) || 1;
          const s = (TURRET_SHOT_SPEED * tier.shotSpeedMul) / len;
          fireEnemy(pools, e, dx * s, dyv * s, dz * s);
        }
        break;
      }
      case 'missileLauncher': {
        if (e.fireTimer === 0 && e.y - ship.y < MISSILE_TRIGGER && e.y > ship.y) {
          e.fireTimer = -1; // one-shot latch: fired
          const m = spawner.spawn('missile', e.x, e.y - e.hd, 4);
          if (m) { m.vy = -MISSILE_SPEED; }
        }
        break;
      }
      case 'missile': {
        // homing: steer x/z toward the player at a capped rate; destructible
        const steer = (cur: number, target: number): number => {
          const d = target - cur;
          return Math.abs(d) < MISSILE_TURN * dt ? d : Math.sign(d) * MISSILE_TURN * dt;
        };
        e.x += steer(e.x, ship.x);
        e.z += steer(e.z, ship.z);
        e.y += e.vy * dt;
        if (e.y < ship.y - 15) e.live = false; // overshot
        break;
      }
      case 'fighter': {
        // converge on player (x, z) with lag, hold distance ahead, fire
        e.y += (e.vy !== 0 ? e.vy : -10) * dt; // drifts toward player
        e.x += Math.sign(ship.x - e.x) * Math.min(FIGHTER_SPEED * dt, Math.abs(ship.x - e.x));
        e.z += Math.sign(ship.z - e.z) * Math.min(FIGHTER_SPEED * 0.7 * dt, Math.abs(ship.z - e.z));
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y - ship.y > 15 && e.y - ship.y < 60) {
          e.fireTimer = FIGHTER_INTERVAL / tier.fireRateMul;
          fireEnemy(pools, e, 0, -TURRET_SHOT_SPEED * tier.shotSpeedMul, 0);
        }
        if (e.y < ship.y - 20) e.live = false; // flown past
        break;
      }
      case 'parkedPlane': {
        if (tier.planesActive && e.y - ship.y < PLANE_TAKEOFF_RANGE && e.y > ship.y && e.vz === 0) {
          e.vz = 12; // take off
          e.points = 300; // airborne bounty (spec §8)
          e.kind = 'fighter';
          e.fireTimer = FIGHTER_INTERVAL;
        }
        break;
      }
      default:
        break; // static kinds: fuelDrum, radar, wall, barrier
    }
  }
}
```

- [ ] **Step 2: Wire into `src/game.ts`**

At §11 step 5, before the fire/projectile block:

```ts
import { updateEnemies, type DifficultyTier } from './entities/enemies';
// module scope (not per-frame):
const TIER_1: DifficultyTier = { fireRateMul: 1, shotSpeedMul: 1, planesActive: false };
// in update(), after spawner.update(...):
updateEnemies(spawner.entities, ship, pools, spawner, dt, TIER_1);
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. Expected: turrets open aimed fire (red bolts) as you approach and can hit you; the launcher at y≈1020 releases one missile that curves toward you and dies to one shot (150 pts via its DEFS entry); enemy shots stop when you die; parked planes stay parked (tier 1).

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit && npx vitest run` — expected: exit 0, all suites pass.

```bash
git add src/entities/enemies.ts src/game.ts
git commit -m "feat: turret, homing missile, fighter, and parked plane AI"
```

---

### Task 11: Fuel system and HUD

**Files:**
- Create: `src/render/hud.ts`
- Modify: `src/entities/ship.ts` (fuel drain + forced descent), `src/game.ts` (drum pickup, fuel state), `src/main.ts` (draw HUD after world)

**Interfaces:**
- Consumes: `Ship`, `Entity` (types), `worldToScreen` not needed (HUD is screen-space), `Game`.
- Produces:
  - `hud.ts`: `drawHud(ctx: CanvasRenderingContext2D, hud: HudState): void`; `interface HudState { fuel: number; lowFuel: boolean; score: number; lives: number; shipZ: number; wallHeights: readonly number[]; t: number }` (`wallHeights` = distinct live wall heights → altimeter tick marks; `t` = elapsed time for flash cadence).
  - `ship.ts` additions: `FUEL_DRAIN = 1.2` (units/sec), `LOW_FUEL = 20`, `FORCED_DESCENT_RATE = 14`; `updateFuel(ship: Ship, dt: number, drainMul: number, frozen: boolean): void`.
  - `game.ts` additions: `game.wallHeights: readonly number[]` (recomputed into a preallocated array each frame), fuel pickup in `onKill`, forced-descent handling.

- [ ] **Step 1: Add fuel to `src/entities/ship.ts`**

```ts
export const FUEL_DRAIN = 1.2; // per second, tier 1
export const LOW_FUEL = 20;
export const FORCED_DESCENT_RATE = 14; // z-units/sec when fuel is empty

/** frozen = boss fight (spec §7: fuel frozen during boss). */
export function updateFuel(ship: Ship, dt: number, drainMul: number, frozen: boolean): void {
  if (ship.state.kind !== 'alive' || frozen) return;
  ship.fuel = Math.max(0, ship.fuel - FUEL_DRAIN * drainMul * dt);
}
```

And in `updateShip`, replace the `dz` clamp line with fuel-empty forced descent:

```ts
  if (ship.fuel <= 0) {
    // forced descent: lateral control only, sink until impact (spec §7)
    ship.z -= FORCED_DESCENT_RATE * dt;
    if (ship.z <= 0) {
      ship.z = 1;
      // impact — caller's collision/death path fires via killShip below
    }
  } else {
    ship.z = Math.min(Z_MAX, Math.max(Z_MIN, ship.z + dz * Z_SPEED * dt));
  }
```

(note: during forced descent `z` is NOT clamped to `Z_MIN`; hitting `z ≤ 0` is the impact) — and in `game.ts` update, after `updateShip`: `if (ship.fuel <= 0 && ship.z <= 1 && ship.state.kind === 'alive') killShip(ship);` then `ship.fuel = 100;` on any death (respawn refuels — otherwise a fuel death is an unrecoverable loop).

- [ ] **Step 2: Fuel pickup + wall heights in `src/game.ts`**

```ts
// in onKill:
function onKill(game: Game, e: Entity): void {
  if (e.kind === 'fuelDrum') game.ship.fuel = Math.min(100, game.ship.fuel + 20);
}

// game fields:
//   wallHeights: number[] — preallocated [], length-reset and refilled each frame
//   time: number — accumulated for HUD flash
// in update(), after spawner.update:
game.wallHeights.length = 0;
for (const e of spawner.entities) {
  if (e.live && e.kind === 'wall' && !game.wallHeights.includes(e.wallHeight)) {
    game.wallHeights.push(e.wallHeight);
  }
}
// fuel (frozen flag becomes phase-aware in Task 12):
updateFuel(ship, dt, 1, false);
```

- [ ] **Step 3: Write `src/render/hud.ts`**

```ts
export interface HudState {
  fuel: number;
  lowFuel: boolean;
  score: number;
  lives: number;
  shipZ: number;
  wallHeights: readonly number[];
  t: number;
}

const ALT_X = 452;      // right edge altimeter
const ALT_TOP = 80;
const ALT_H = 400;      // px for z 0..90
const Z_MAX_HUD = 90;

export function drawHud(ctx: CanvasRenderingContext2D, hud: HudState): void {
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';

  // score + lives (top-left)
  ctx.fillStyle = '#ffe040';
  ctx.fillText(`SCORE ${hud.score.toString().padStart(6, '0')}`, 8, 8);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(`SHIPS ${'▲'.repeat(Math.max(0, hud.lives))}`, 8, 22);

  // altimeter (right edge): bar + wall-height ticks + integer readout
  const zToY = (z: number): number => ALT_TOP + ALT_H - (z / Z_MAX_HUD) * ALT_H;
  const flash = hud.lowFuel && Math.floor(hud.t * 4) % 2 === 0;
  ctx.strokeStyle = flash ? '#ff4040' : '#70c8ff';
  ctx.strokeRect(ALT_X, ALT_TOP, 12, ALT_H);
  for (const h of hud.wallHeights) {
    ctx.fillStyle = '#ff9020';
    ctx.fillRect(ALT_X - 4, zToY(h), 20, 2); // tick at each wall height in play
  }
  ctx.fillStyle = flash ? '#ff4040' : '#70c8ff';
  ctx.fillRect(ALT_X + 2, zToY(hud.shipZ) - 2, 8, 4); // ship marker
  ctx.fillText(String(Math.round(hud.shipZ)), ALT_X - 14, zToY(hud.shipZ) - 4);

  // fuel gauge (bottom)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText('FUEL', 8, 610);
  ctx.strokeStyle = '#e8e8e8';
  ctx.strokeRect(44, 610, 200, 10);
  ctx.fillStyle = hud.lowFuel ? (flash ? '#ff4040' : '#ff9020') : '#20a040';
  ctx.fillRect(45, 611, (198 * hud.fuel) / 100, 8);

  ctx.restore();
}
```

- [ ] **Step 4: Wire into `src/main.ts` render**

After `renderer.render(...)`:

```ts
import { drawHud } from './render/hud';
import { LOW_FUEL } from './entities/ship';
// render callback:
drawHud(ctx, {
  fuel: game.ship.fuel,
  lowFuel: game.ship.fuel <= LOW_FUEL,
  score: game.score,
  lives: game.ship.lives,
  shipZ: game.ship.z,
  wallHeights: game.wallHeights,
  t: game.time,
});
```

(`game.time += dt` in update; the HudState object literal is a render-side allocation — acceptable per the update-only constraint, same rationale as renderer closures.)

- [ ] **Step 5: Verify manually**

Run: `npm run dev`. Expected: fuel bar drains slowly; shooting a drum bumps it +20 visibly; at ≤20 the altimeter and fuel bar flash red; let fuel hit 0 → ship sinks under lateral-only control until it impacts and explodes, then respawns with full fuel; altimeter ticks appear/disappear as walls of different heights enter/leave play, and the ship marker aligns with a wall's tick exactly when the ship is at wall-top height.

- [ ] **Step 6: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run` — expected: pass.

```bash
git add src/render/hud.ts src/entities/ship.ts src/game.ts src/main.ts
git commit -m "feat: fuel drain, forced descent, and HUD with wall-tick altimeter"
```

---

### Task 12: Phases, fighter waves, and the Zaxxon boss

**Files:**
- Create: `src/world/phases.ts`, `src/entities/boss.ts`
- Modify: `src/levels/level1.json` (append phase 3 segments), `src/game.ts` (drive phases; fuel freeze; fuel bonus)

**Interfaces:**
- Consumes: `Game` internals, `Spawner.spawn`, `updateEnemies`' `DifficultyTier`, `fireEnemy`.
- Produces:
  - `phases.ts`: `PHASE1_END = 2000`, `PHASE2_END = 2800`, `PHASE3_END = 3600`, `BOSS_Y = 3500`; `createPhases(): Phases`; `interface Phases { update(game: Game, dt: number): void; hasFloor: boolean; fuelFrozen: boolean; scrollPaused: boolean; loopN: number; tier: DifficultyTier & { scrollMul: number; fuelDrainMul: number; slotShrink: number } }`. Phase boundaries are camera-relative within a loop: `localY = cameraY - loopN * PHASE3_END`.
  - `boss.ts`: `spawnBoss(spawner: Spawner, y: number): BossRefs | null`; `interface BossRefs { body: Entity; core: Entity }`; `updateBoss(refs: BossRefs, ship: Ship, pools: Pools, spawner: Spawner, dt: number): 'fighting' | 'killed' | 'escaped'`; `BOSS_CORE_HP = 6`, `BOSS_CYCLES = 5` (missile volleys before it "wins" and the level loops anyway).

- [ ] **Step 1: Append phase 3 to `src/levels/level1.json`**

Add to the existing `segments` array (phase 2, y 2000–2800, is open space — fighters come from code, not data):

```json
    { "type": "wall", "y": 2880, "xStart": 0, "xEnd": 100, "height": 25 },
    { "type": "turret", "y": 2950, "x": 40 },
    { "type": "turret", "y": 2970, "x": 65 },
    { "type": "fuelDrum", "y": 3020, "x": 55 },
    { "type": "wall", "y": 3080, "xStart": 0, "xEnd": 50, "height": 50 },
    { "type": "wall", "y": 3080, "xStart": 66, "xEnd": 100, "height": 50 },
    { "type": "missileLauncher", "y": 3160, "x": 30 },
    { "type": "radar", "y": 3200, "x": 70 },
    { "type": "fuelDrum", "y": 3260, "x": 45 },
    { "type": "barrier", "y": 3320, "xStart": 0, "xEnd": 100, "height": 35 },
    { "type": "turret", "y": 3400, "x": 50 }
```

- [ ] **Step 2: Write `src/entities/boss.ts`**

```ts
import type { Entity, Ship } from './types';
import type { Pools } from './projectiles';
import type { Spawner } from '../world/spawner';

export const BOSS_CORE_HP = 6;
export const BOSS_CYCLES = 5;
const TRACK_SPEED = 8;       // slow x tracking
const CYCLE_INTERVAL = 3.0;  // seconds between homing-missile volleys

export interface BossRefs {
  body: Entity;
  core: Entity;
  cycles: number;
}

export function spawnBoss(spawner: Spawner, y: number): BossRefs | null {
  const body = spawner.spawn('boss', 50, y, 18);
  const core = spawner.spawn('bossCore', 50, y - 6, 10);
  if (!body || !core) return null;
  body.hw = 12; body.hd = 6; body.hh = 18; body.hp = Infinity; body.points = 0;
  core.hw = 2; core.hd = 2; core.hh = 2; core.hp = BOSS_CORE_HP; core.points = 6000; // 1000 + 5000 kill
  body.fireTimer = CYCLE_INTERVAL;
  return { body, core, cycles: 0 };
}

export function updateBoss(
  refs: BossRefs,
  ship: Ship,
  _pools: Pools,
  spawner: Spawner,
  dt: number,
): 'fighting' | 'killed' | 'escaped' {
  const { body, core } = refs;
  if (!core.live) { body.live = false; return 'killed'; } // collision pass killed the core

  // slow x tracking; core rides the body
  const dx = ship.x - body.x;
  body.x += Math.sign(dx) * Math.min(TRACK_SPEED * dt, Math.abs(dx));
  core.x = body.x;
  core.y = body.y - 6;

  body.fireTimer -= dt;
  if (body.fireTimer <= 0) {
    body.fireTimer = CYCLE_INTERVAL;
    refs.cycles += 1;
    if (refs.cycles > BOSS_CYCLES) {
      body.live = false;
      core.live = false;
      return 'escaped'; // survived: loop without the 5000 (spec §9.3)
    }
    const m = spawner.spawn('missile', body.x, body.y - body.hd, 8);
    if (m) m.vy = -45;
  }
  return 'fighting';
}
```

- [ ] **Step 3: Write `src/world/phases.ts`**

```ts
import type { DifficultyTier } from '../entities/enemies';
import type { Game } from '../game';
import { spawnBoss, updateBoss, type BossRefs } from '../entities/boss';

export const PHASE1_END = 2000;
export const PHASE2_END = 2800;
export const PHASE3_END = 3600;
export const BOSS_Y = 3500;

export interface FullTier extends DifficultyTier {
  scrollMul: number;
  fuelDrainMul: number;
  slotShrink: number;
}

type PhaseName = 'fortress1' | 'space' | 'fortress2' | 'boss';

export interface Phases {
  update(game: Game, dt: number): void;
  hasFloor: boolean;
  fuelFrozen: boolean;
  scrollPaused: boolean;
  loopN: number;
  tier: FullTier;
  name: PhaseName;
}

function tierFor(n: number): FullTier {
  return {
    scrollMul: Math.min(1.08 ** n, 1.5),
    fireRateMul: 1 + 0.1 * n,
    shotSpeedMul: 1 + 0.1 * n,
    fuelDrainMul: 1.15 ** n,
    slotShrink: Math.min(n * 2, 6),
    planesActive: n >= 1,
  };
}

const WAVE_YS = [2100, 2250, 2400, 2550] as const; // 3+3+2+2 = 10 fighters
const WAVE_SIZES = [3, 3, 2, 2] as const;

export function createPhases(): Phases {
  let bossRefs: BossRefs | null = null;
  let waveIdx = 0;
  let bonusPaid: PhaseName | null = null;

  const phases: Phases = {
    hasFloor: true,
    fuelFrozen: false,
    scrollPaused: false,
    loopN: 0,
    tier: tierFor(0),
    name: 'fortress1',

    update(game: Game, dt: number): void {
      const localY = game.cameraY - phases.loopN * PHASE3_END;
      const prev = phases.name;
      phases.name =
        localY < PHASE1_END ? 'fortress1'
        : localY < PHASE2_END ? 'space'
        : localY < BOSS_Y - 60 ? 'fortress2'
        : 'boss';

      phases.hasFloor = phases.name !== 'space';
      phases.fuelFrozen = phases.name === 'boss';

      // end-of-phase fuel bonus (fuel × 10), once per transition
      if (prev !== phases.name && bonusPaid !== phases.name) {
        game.score += Math.round(game.ship.fuel * 10);
        bonusPaid = phases.name;
      }

      // phase 2: fighter waves at fixed local trigger ys
      while (waveIdx < WAVE_YS.length && localY >= (WAVE_YS[waveIdx] ?? Infinity)) {
        const n = WAVE_SIZES[waveIdx] ?? 2;
        for (let i = 0; i < n; i++) {
          const f = game.spawner.spawn(
            'fighter',
            20 + i * 30,
            game.cameraY + 80 + i * 8,
            30 + i * 10,
          );
          if (f) f.fireTimer = 1 + i * 0.5;
        }
        waveIdx++;
      }

      // phase 3 → boss
      if (phases.name === 'boss') {
        if (!bossRefs) {
          bossRefs = spawnBoss(game.spawner, phases.loopN * PHASE3_END + BOSS_Y);
          phases.scrollPaused = true;
        }
        if (bossRefs) {
          const result = updateBoss(bossRefs, game.ship, game.pools, game.spawner, dt);
          if (result !== 'fighting') {
            // loop to tier n+1 (kill is optional glory — both outcomes loop)
            phases.loopN += 1;
            phases.tier = tierFor(phases.loopN);
            phases.scrollPaused = false;
            phases.name = 'fortress1';
            bossRefs = null;
            waveIdx = 0;
            bonusPaid = null;
            game.spawner.reset();
            game.rebaseForLoop(phases.loopN * PHASE3_END); // see step 4
          }
        }
      }
    },
  };
  return phases;
}
```

- [ ] **Step 4: Drive phases from `src/game.ts`**

- Add `phases = createPhases()` to the game; expose `game.hasFloor = phases.hasFloor` each frame; `hasFloor` in phase-2 also empties the shadow via the existing renderer path.
- Scroll: `updateShip(ship, dt, phases.scrollPaused ? 0 : SCROLL_SPEED * phases.tier.scrollMul)`.
- Fuel: `updateFuel(ship, dt, phases.tier.fuelDrainMul, phases.fuelFrozen)`.
- Enemies: pass `phases.tier` instead of `TIER_1` (delete `TIER_1`).
- Call `phases.update(game, dt)` after the collision pass (§11 step 8: phase transitions).
- Add `rebaseForLoop(baseY: number): void` to `Game`: the spawner replays the same segments each loop, so on loop it re-sorts a copy of the segments with `y + baseY` offsets. Implement by making `createSpawner` accept an offset in `reset(offsetY = 0)` and adding `offsetY` to `seg.y` inside `spawnSegment`; `rebaseForLoop(base)` just calls `spawner.reset(base)`. Update `tests/spawner.test.ts` `reset()` case to also assert the offset: after `s.reset(1000)`, `s.update(1200)` spawns the drum originally at y=200 (now at 1200).
- Slot shrink (difficulty §9.4 "narrower slots"): in `spawnSegment`, for `wall` segments that do not span the full corridor (`xStart > 0 || xEnd < 100`), widen the wall toward the gap: `if (seg.xStart === 0) xEnd += slotShrink; else xStart -= slotShrink;` — `createSpawner` gains a `getSlotShrink: () => number` param supplied by game.ts from `phases.tier.slotShrink`.

- [ ] **Step 5: Verify manually**

Run: `npm run dev` (temporarily set `SCROLL_SPEED = 120` locally to reach later phases fast — revert before commit). Expected: at y≈2000 the floor drops away to starfield and the shadow vanishes (altimeter-only — the deliberate spike); fighter pairs/triples converge and fire; floor returns at y≈2800 with the second fortress; at y≈3500 scrolling stops, the boss tracks your x and lobs homing missiles; 6 hits on the small core destroy it (+6000 + fuel bonus) OR after 5 volleys it escapes; either way the level restarts seamlessly at tier 2 (faster scroll, hotter turrets, planes take off, slots narrower).

- [ ] **Step 6: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run` — expected: pass (including updated spawner offset test).

```bash
git add src/world/phases.ts src/entities/boss.ts src/levels/level1.json src/game.ts src/world/spawner.ts tests/spawner.test.ts
git commit -m "feat: three-phase loop with fighter waves and Zaxxon boss"
```

---

### Task 13: Game modes, high scores, attract screen

**Files:**
- Create: `src/scores.ts`
- Modify: `src/main.ts` (mode machine + attract/pause/gameOver/entry overlays), `src/game.ts` (expose `reset()`, bonus ship)

**Interfaces:**
- Consumes: `GameMode` (types), `consumePress` (input), `toggleInvertY`/`toggleMuted`/`settings` (settings), `Game`.
- Produces: `scores.ts`: `loadScores(): ScoreRow[]`, `qualifies(score: number): boolean`, `insertScore(name: string, score: number): void` with `interface ScoreRow { name: string; score: number }` (top-10, key `zaxxon.scores.v1`, try/catch on all storage access). `game.ts`: `reset(): void` (fresh ship/pools/spawner/phases/score), `EXTRA_SHIP_AT = 10000` bonus ship awarded once.

- [ ] **Step 1: Write `src/scores.ts`**

```ts
const KEY = 'zaxxon.scores.v1';
export interface ScoreRow { name: string; score: number }

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is ScoreRow =>
        typeof r === 'object' && r !== null &&
        typeof (r as ScoreRow).name === 'string' &&
        typeof (r as ScoreRow).score === 'number')
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  const rows = loadScores();
  return score > 0 && (rows.length < 10 || score > (rows[9]?.score ?? 0));
}

export function insertScore(name: string, score: number): void {
  const rows = loadScores();
  rows.push({ name, score });
  rows.sort((a, b) => b.score - a.score);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 10)));
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Bonus ship + reset in `src/game.ts`**

```ts
export const EXTRA_SHIP_AT = 10000;
// game field: bonusAwarded = false
// in update(), after collide():
if (!game.bonusAwarded && game.score >= EXTRA_SHIP_AT) {
  game.bonusAwarded = true;
  ship.lives += 1;
}
```

`reset()`: reassign fresh `createShip()` fields onto the existing ship object (`Object.assign(ship, createShip())`), `spawner.reset()`, all pool `live = false`, `score = 0`, `bonusAwarded = false`, new `createPhases()` — mode transitions are rare, allocation here is fine.

- [ ] **Step 3: Mode machine in `src/main.ts`**

```ts
import type { GameMode } from './entities/types';
import { consumePress } from './input';
import { settings, toggleInvertY, toggleMuted } from './settings';
import { loadScores, qualifies, insertScore } from './scores';

let mode: GameMode = { kind: 'attract' };

// update callback becomes:
(dt) => {
  if (consumePress('KeyI')) toggleInvertY();
  if (consumePress('KeyM')) toggleMuted();
  switch (mode.kind) {
    case 'attract':
      if (consumePress('Enter')) { game.reset(); mode = { kind: 'playing' }; }
      break;
    case 'playing':
      if (consumePress('KeyP')) { mode = { kind: 'paused' }; break; }
      game.update(dt);
      if (game.ship.lives < 0) {
        mode = qualifies(game.score)
          ? { kind: 'highScoreEntry', name: '' }
          : { kind: 'gameOver', t: 3 };
      }
      break;
    case 'paused':
      if (consumePress('KeyP')) mode = { kind: 'playing' };
      break;
    case 'gameOver':
      mode.t -= dt;
      if (mode.t <= 0) mode = { kind: 'attract' };
      break;
    case 'highScoreEntry':
      // name entry: A–Z keys append (max 3), Backspace deletes, Enter commits
      for (let c = 65; c <= 90; c++) {
        if (mode.name.length < 3 && consumePress(`Key${String.fromCharCode(c)}`)) {
          mode = { kind: 'highScoreEntry', name: mode.name + String.fromCharCode(c) };
        }
      }
      if (consumePress('Backspace')) {
        mode = { kind: 'highScoreEntry', name: mode.name.slice(0, -1) };
      }
      if (consumePress('Enter') && mode.name.length > 0) {
        insertScore(mode.name, game.score);
        mode = { kind: 'attract' };
      }
      break;
  }
}
```

Note `KeyI` reuses letter I: during `highScoreEntry` the settings toggles must be skipped — guard the two `consumePress` toggle lines with `if (mode.kind !== 'highScoreEntry')`. Add `Backspace` to `GAME_KEYS` in `input.ts`; A–Z keys don't need `preventDefault`.

The render callback overlays per mode: `attract` = title "ZAXXON", "ENTER TO START", "I: INVERT Y (currently …) / M: SOUND (…) / P: PAUSE", top-10 table from `loadScores()` (cache the array when entering attract, don't re-read every frame); `paused` = dim rect + "PAUSED"; `gameOver` = "GAME OVER"; `highScoreEntry` = "NEW HIGH SCORE" + `mode.name + '_'`. Playing renders the world exactly as before; attract renders the world frozen behind the title (whatever state the last game left).

- [ ] **Step 4: Verify manually**

Run: `npm run dev`. Expected: boots to attract with title + scores; Enter starts a fresh run; P pauses/resumes (simulation truly frozen); I/M toggle and persist across reloads; losing the last life goes to entry (if top-10) → type 3 letters → Enter → attract shows the new row; reload — the score survived.

- [ ] **Step 5: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/scores.ts src/game.ts src/main.ts src/input.ts
git commit -m "feat: attract/pause/game-over/high-score modes with persistence"
```

---

### Task 14: Synthesized audio

**Files:**
- Create: `src/audio.ts`
- Modify: `src/game.ts` (play calls at events), `src/main.ts` (init on first gesture)

**Interfaces:**
- Consumes: `settings.muted`.
- Produces: `initAudio(): void` (idempotent; call from a pointer/keydown gesture), `play(name: SfxName): void` (no-op before init or when muted), `type SfxName = 'laser' | 'enemyShot' | 'explosion' | 'fuelPickup' | 'klaxon' | 'bossHit' | 'extraLife'`; `startKlaxonLoop(on: boolean): void` for the low-fuel state.

- [ ] **Step 1: Write `src/audio.ts`**

```ts
import { settings } from './settings';

export type SfxName =
  | 'laser' | 'enemyShot' | 'explosion' | 'fuelPickup' | 'klaxon' | 'bossHit' | 'extraLife';

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let klaxonTimer: number | null = null;

interface Recipe {
  dur: number;
  gen: (t: number, dur: number) => number; // sample at time t, range [-1, 1]
}

const noise = (): number => Math.random() * 2 - 1;
const env = (t: number, dur: number): number => Math.max(0, 1 - t / dur);

const RECIPES: Record<SfxName, Recipe> = {
  laser:      { dur: 0.12, gen: (t, d) => Math.sin(2 * Math.PI * (900 - 3000 * t) * t) * env(t, d) },
  enemyShot:  { dur: 0.15, gen: (t, d) => Math.sin(2 * Math.PI * (300 + 800 * t) * t) * env(t, d) * 0.7 },
  explosion:  { dur: 0.5,  gen: (t, d) => noise() * env(t, d) ** 2 },
  fuelPickup: { dur: 0.2,  gen: (t, d) => Math.sin(2 * Math.PI * (440 + 660 * Math.floor(t * 20) / 2) * t) * env(t, d) * 0.6 },
  klaxon:     { dur: 0.3,  gen: (t, d) => Math.sign(Math.sin(2 * Math.PI * 220 * t)) * env(t, d) * 0.4 },
  bossHit:    { dur: 0.25, gen: (t, d) => (Math.sin(2 * Math.PI * 150 * t) + noise() * 0.5) * env(t, d) * 0.8 },
  extraLife:  { dur: 0.6,  gen: (t, d) => Math.sin(2 * Math.PI * [523, 659, 784, 1047][Math.min(3, Math.floor(t * 8))]! * t) * env(t, d) * 0.5 },
};

export function initAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  const rate = ctx.sampleRate;
  for (const [name, r] of Object.entries(RECIPES) as [SfxName, Recipe][]) {
    const buf = ctx.createBuffer(1, Math.ceil(r.dur * rate), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = r.gen(i / rate, r.dur);
    buffers.set(name, buf);
  }
}

export function play(name: SfxName): void {
  if (!ctx || settings.muted || ctx.state !== 'running') return;
  const buf = buffers.get(name);
  if (!buf) return;
  const src = ctx.createBufferSource(); // BufferSources are one-shot by design; cheap
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}

export function startKlaxonLoop(on: boolean): void {
  if (on && klaxonTimer === null) {
    klaxonTimer = window.setInterval(() => play('klaxon'), 800);
  } else if (!on && klaxonTimer !== null) {
    clearInterval(klaxonTimer);
    klaxonTimer = null;
  }
}
```

(Direct sample synthesis into `createBuffer` is simpler than `OfflineAudioContext` graphs and identical in result for these one-shots; it happens once at init. `AudioBufferSourceNode`s are single-use per Web Audio spec — creating one per shot is the pooled-buffer pattern the spec intends; the *buffers* are pooled, sources are throwaway handles.)

- [ ] **Step 2: Hook events**

- `main.ts`: `addEventListener('keydown', initAudio, { once: true });` plus same for `pointerdown`.
- `game.ts`: `play('laser')` when `firePlayer` returns true; `play('explosion')` in `killShip` call sites and enemy kills; `play('fuelPickup')` in the drum branch of `onKill`; `play('bossHit')` when the boss core takes a hit (in the collision pass when `e.kind === 'bossCore'` and hp still > 0); `play('extraLife')` at the bonus-ship award; `startKlaxonLoop(ship.fuel <= LOW_FUEL && ship.fuel > 0 && mode is playing)` — call from `main.ts` update with `startKlaxonLoop(mode.kind === 'playing' && game.ship.fuel <= LOW_FUEL && game.ship.fuel > 0)`.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. Expected: silent until first keypress; then laser pew on fire, noise burst on kills/death, chirp on fuel pickup, klaxon pulse under 20 fuel that stops when refueled or paused, jingle at 10,000. `M` silences everything instantly.

- [ ] **Step 4: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/audio.ts src/game.ts src/main.ts
git commit -m "feat: synthesized Web Audio SFX with pooled buffers"
```

---

### Task 15: Acceptance pass and build

**Files:**
- Modify: whatever the checklist flushes out; `README.md` (create: run/controls/deploy notes)

**Interfaces:** none new — this task verifies SPECS §12 acceptance criteria end-to-end.

- [ ] **Step 1: Full automated gate**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green; `dist/` contains a static bundle. Open `dist/index.html` via `npx vite preview` and confirm the game boots from the built bundle.

- [ ] **Step 2: Walk SPECS §12 acceptance criteria one by one**

- [ ] Vitest: wall clearance at `wallHeight ± 1` (collision suite, Task 3) — green.
- [ ] Vitest: no tunneling through 1-unit target at max projectile speed (Task 3) — green.
- [ ] Shadow tracks ship `x` exactly and vanishes over the y≈1200 gap and all of phase 2 — visual check.
- [ ] Zero allocation in `update()`: DevTools → Performance → record 30 s of play → heap sawtooth must be flat during steady play (render-side allocations show as small; confirm no per-tick growth trend). If the update path allocates, fix it here.
- [ ] Fuel-empty → forced descent (Task 11 behavior still works after phase integration).
- [ ] No sprite popping crossing wall tops: fly along a wall top at ±1 z and watch draw order — stable (depth-key tie-break by id).
- [ ] Window blur clears input (hold an arrow, click outside — ship stops); tab-hide pauses (counter check from Task 5).
- [ ] Full loop: Phase 1 → 2 → 3 → boss → tier 2 playable without reload.

Each unchecked failure becomes a fix commit before proceeding.

- [ ] **Step 3: Write `README.md`**

Short: what it is, `npm install && npm run dev`, controls table (arrows/Space/P/I/M/Enter), `npm run build` → deploy `dist/` to any static host.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: acceptance pass, README, production build verified"
```

---

## Plan Self-Review Notes

Checked against SPECS.md §1–§12:

- **§2 quantization** intentionally omitted (design addendum decision). **§2 viewport** letterbox + `imageSmoothingEnabled=false` in Tasks 1/5.
- **§3** controls/inversion/blur (Task 4), movement/clamps/banking (Task 7), state machine + death rules + bonus ship (Tasks 7/13).
- **§4** shadow (Task 7), altimeter with wall ticks (Task 11), wall stripes (Task 7 renderer).
- **§5** overlap/swept/priority + all four required test areas (Tasks 3/9).
- **§6** cap-4 cannon, pools 8/32, turret aim, homing missiles (Tasks 8/10).
- **§7** drain/pickup/klaxon/forced-descent/boss-freeze (Tasks 11/12/14).
- **§8** every catalog entity has a spawner DEF, sprite, AI or static behavior, and points (Tasks 6/9/10/12).
- **§9** JSON segments + lookahead (Task 9), three phases + loop + scaling incl. narrower slots and plane activation (Task 12/15), boss weak point 6 hits / escape-also-loops (Task 12).
- **§10** scoring + fuel bonus (Tasks 9/12), mode union + top-10 persistence (Task 13).
- **§11** exact update order encoded in `game.ts` with comments (Task 9); visibility pause + accumulator clamp (Task 5); pooled audio (Task 14).
- **§12 deliverables** 1–7 map to Tasks 4, 3, 2, 5, 9+12, 11, 15 respectively.

Known deliberate deviations, all recorded in-task: `AABB` defined in `math/collision.ts` and re-exported from `entities/types.ts` (dependency direction); flat `Entity` instead of discriminated union (pooling constraint); `settings.ts`/`scores.ts`/`game.ts` files added beyond the spec tree (single-responsibility for storage and the update-order owner).

