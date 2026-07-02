# Project Specification: Zaxxon-Style Isometric Shoot-'em-Up (v3 — TypeScript/Vite)

## 1. Project Overview & Stack

Build a 2.5D arcade shoot-'em-up in the style of SEGA's 1982 *Zaxxon*: a forced-isometric, continuously scrolling flight game where the player pilots a ship over a fortress, managing **altitude** as the core mechanic. All gameplay logic runs in true 3D world coordinates; the isometric view is purely a rendering projection.

**Design pillars:**
1. Altitude is the game. Every obstacle, weapon, and UI element exists to make the player reason about height.
2. The shadow and altimeter are the player's only depth cues — they must be flawless.
3. Deterministic, readable difficulty: the player should always understand why they died.

### 1.1 Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript (strict mode) | Compile-time safety on the coordinate math — this project is 90% math bugs waiting to happen |
| Bundler/dev | Vite | Instant HMR, native JSON imports for levels, static build |
| Rendering | Canvas 2D | Sufficient for <100 flat-shaded sprites/frame; zero dependency. Swap to PixiJS only if profiling demands it |
| Tests | Vitest | Collision module and projection math get unit tests; Vitest shares Vite config |
| Lint/format | ESLint (typescript-eslint) + Prettier | — |
| State persistence | `localStorage` | High scores + settings |
| Runtime deps | **None** | The entire game is stdlib + Canvas. Resist the urge to add an engine |

`tsconfig` requirements: `"strict": true`, `"noUncheckedIndexedAccess": true` (catches level-data indexing bugs), `"exactOptionalPropertyTypes": true`.

### 1.2 Project Structure

```
zaxxon/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts              # bootstrap: canvas, loop, state machine
│   ├── loop.ts              # fixed-timestep accumulator
│   ├── input.ts             # keyboard state map
│   ├── math/
│   │   ├── projection.ts    # world → screen transform
│   │   └── collision.ts     # AABB + swept tests  ← unit tested
│   ├── entities/
│   │   ├── types.ts         # all interfaces (below)
│   │   ├── ship.ts
│   │   ├── projectiles.ts   # pooled
│   │   ├── enemies.ts       # turrets, fighters, missiles
│   │   └── boss.ts
│   ├── world/
│   │   ├── spawner.ts       # segment lookahead spawn/despawn
│   │   ├── phases.ts        # phase state machine + difficulty scaling
│   │   └── shadow.ts        # floor raycast
│   ├── render/
│   │   ├── renderer.ts      # depth-sorted draw pass
│   │   ├── sprites.ts       # spritesheet atlas
│   │   └── hud.ts           # altimeter, fuel, score, lives
│   ├── audio.ts             # Web Audio, pooled buffers
│   └── levels/
│       └── level1.json      # segment data (Vite imports as typed JSON)
├── tests/
│   ├── collision.test.ts
│   └── projection.test.ts
└── package.json
```

Scripts: `dev` (vite), `build` (tsc --noEmit && vite build), `test` (vitest), `lint`.

---

## 2. Coordinate System & Projection

### 2.1 World Space (authoritative)
Right-handed 3-axis system:

| Axis | Meaning | Range |
|------|---------|-------|
| `x` | Lateral position across the flight corridor | 0–100 (clamped for player) |
| `y` | Forward progress along the map | 0 → level length (monotonically increasing) |
| `z` | Altitude above the floor plane | 0–90 (player clamped to 8–90) |

The **world does not move**. The player's `y` increases at constant `SCROLL_SPEED`; the camera follows `y`. This avoids accumulating float error from moving every map tile each frame.

```ts
// math/projection.ts
export interface Vec3 { x: number; y: number; z: number }

export const TILE_W = 32;
export const TILE_H = 16;
export const Z_SCALE = 2.2;   // screen px per altitude unit — tune

export function worldToScreen(p: Vec3, cameraY: number, origin: {x: number; y: number}) {
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

- 2:1 dimetric projection (the classic "Zaxxon slant").
- **Depth sorting:** sort renderables by `depthKey` ascending each frame; break ties by entity `id` for stability.
- Viewport: vertical aspect (3:4 or 9:16), letterboxed. Use a fixed internal resolution (e.g., 480×640) scaled to the canvas with `imageSmoothingEnabled = false` for crisp pixels.

### 2.2 Altitude Quantization (authenticity option)
Optionally quantize player `z` to discrete steps of ~2.8 units (32 levels), matching the original's chunky altitude feel. Interpolate the rendered position between steps.

---

## 3. Player Ship

### 3.1 Controls
Keyboard via a key-state map (never act inside `keydown` handlers — sample state in the fixed update):

```ts
// input.ts
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (GAME_KEYS.has(e.code)) e.preventDefault(); });
addEventListener('keyup',   e => keys.delete(e.code));
export const isDown = (code: string) => keys.has(code);
```

| Input | Effect |
|-------|--------|
| ArrowUp | **Dive** (decrease `z`) |
| ArrowDown | **Climb** (increase `z`) |
| ArrowLeft / ArrowRight | Shift `x` |
| Space | Fire (hold for autofire, rate-limited) |

Provide an "inverted Y" toggle (persisted to `localStorage`); default to authentic (up = dive). Also handle `blur` → clear the key set, or the ship flies itself when the window loses focus.

### 3.2 Movement
- Lateral speed `X_SPEED` and climb speed `Z_SPEED` in units/sec; fully responsive, no inertia — Zaxxon is a precision game.
- Ship sprite banks (3-frame tilt) based on lateral input.
- Clamp `x ∈ [X_MIN, X_MAX]`, `z ∈ [8, 90]`. Flying at minimum altitude over open floor is safe; the floor itself never kills.

### 3.3 Ship State Machine

```ts
type ShipState =
  | { kind: 'alive' }
  | { kind: 'exploding'; t: number }        // 0.8s, input locked
  | { kind: 'respawning'; t: number };      // 2s invulnerable, blink

interface Ship extends Vec3 {
  state: ShipState;
  fuel: number;        // 0–100
  lives: number;
  fireCooldown: number;
}
```

- On death: decrement lives, reset `z = 50`, `x =` corridor center; **do not rewind `y`**.
- Lives: 3 to start; bonus ship at 10,000 pts.

---

## 4. Shadow & Altitude Cues (Critical UX)

Three redundant depth cues; all ship in v1.

1. **Shadow sprite** at `(ship.x, ship.y, floorHeightAt(x, y))`. Over floor gaps the shadow disappears — intentional and authentic ("nothing below you"). Shadow does **not** scale with altitude; the *screen distance* between ship and shadow is the altitude read. Renders above floor, below all entities.
2. **Altimeter:** vertical bar on the screen edge with integer readout; tick marks drawn at each wall height present in the current phase.
3. **Wall height markers:** wall leading faces display horizontal stripes at fixed altitude intervals so the player can compare against the altimeter.

---

## 5. Collision System

⚠️ **Never use exact equality on coordinates.** All checks are interval overlaps on world-space AABBs.

```ts
// entities/types.ts
export interface AABB extends Vec3 {
  hw: number;  // half-width  (x)
  hd: number;  // half-depth  (y)
  hh: number;  // half-height (z)
}
```

### 5.1 Overlap Test

```ts
// math/collision.ts
export function overlap(a: AABB, b: AABB): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw
      && Math.abs(a.y - b.y) < a.hd + b.hd
      && Math.abs(a.z - b.z) < a.hh + b.hh;
}
```

### 5.2 Walls
A wall is an AABB with `z = wallHeight / 2`, `hh = wallHeight / 2`. The generic overlap test naturally encodes "collide unless altitude > wall height." Slotted walls = two wall AABBs with a gap in `x` — no special-case code.

### 5.3 Projectiles (swept, not sampled)
Projectiles travel fast along `+y`; per-frame point tests tunnel through thin targets. Test the swept segment:

```ts
export function projectileHit(p: Projectile, t: AABB): boolean {
  return Math.abs(p.x - t.x) < p.hw + t.hw
      && Math.abs(p.z - t.z) < p.hh + t.hh
      && p.yPrev < t.y + t.hd     // swept y-interval overlap
      && p.y     > t.y - t.hd;
}
```

- Record `yPrev` before advancing each projectile every tick.
- Player projectiles despawn after `PROJ_RANGE` units or on any hit; **walls block shots**.
- Enemy projectiles: same system reversed; player hitbox ≈ 70% of sprite (standard shmup courtesy).

### 5.4 Collision Priority per Frame
1. Player vs. walls/terrain → death
2. Player vs. enemy entities → death (both die)
3. Player vs. enemy projectiles → death
4. Player projectiles vs. targets → destroy, score
5. Player projectiles vs. walls → despawn projectile

**Vitest coverage required** for: wall clearance at `wallHeight ± 1`, swept-test anti-tunneling at max projectile speed, slotted-wall gap passage, hitbox-forgiveness margins.

---

## 6. Weapons

```ts
interface Projectile extends AABB {
  yPrev: number;
  vy: number;          // + for player, − for aimed enemy shots
  vx: number; vz: number;
  owner: 'player' | 'enemy';
  live: boolean;       // pool flag
}
```

- **Player cannon:** autofire ≈ 4/sec; spawn at ship nose traveling `+y` at ~3× scroll speed. **Max 4 live player projectiles** — this cap is the real difficulty knob for turret duels; make it a tunable constant.
- **Pooling:** preallocate fixed arrays (player: 8, enemy: 32) and toggle `live`. No allocation inside the update loop — keeps GC pauses out of the fixed timestep.
- **Turret fire:** aimed shots at the player's position (leading optional at higher loops), rate-limited, only within `y` activation range.
- **Homing missiles:** steer toward player `(x, z)` at a capped turn rate; destructible.

---

## 7. Fuel System

- `fuel` starts at 100, drains at ~1.2/sec (scales per loop).
- **Shooting a fuel drum grants +20 fuel** (cap 100). Keep it — it's iconic and creates the dive-low risk/reward loop.
- `fuel ≤ 20`: altimeter flashes + low-fuel klaxon.
- `fuel === 0`: forced descent — `z` decreases at fixed rate, only lateral control, until impact → death. Reads better than instant game-over.
- Fuel frozen during the boss (prevents anticlimactic starvation).

---

## 8. Entity Catalog

```ts
type EntityKind =
  | 'fuelDrum' | 'turret' | 'radar' | 'missileLauncher'
  | 'parkedPlane' | 'wall' | 'barrier' | 'fighter' | 'boss';

interface Entity extends AABB {
  id: number;
  kind: EntityKind;
  hp: number;
  points: number;
  // kind-specific state kept in a discriminated union in practice
}
```

| Entity | Placement | Behavior | Points |
|--------|-----------|----------|--------|
| Fuel drum | Floor (`z=0`) | Static; +20 fuel when shot | 50 |
| Gun turret | Floor or wall-top | Aimed shots when in range | 200 |
| Radar dish | Floor or wall-top | Static bonus target | 100 |
| Missile launcher | Floor | Fires one homing missile at trigger `y` | 300 (missile 150) |
| Parked plane | Floor | Static; takes off at higher loops | 100 / 300 airborne |
| Wall / slotted wall | Spans corridor | Fixed height; kills on contact | — |
| Energy barrier | Between posts | Force-field band at fixed `z`; fly under or over | — |
| Enemy fighter | Phase 2 | Converges on player `(x, z)` with lag, fires | 200 |
| Zaxxon robot | Phase 3 | See §9.3 | 1000 + 5000 kill |

---

## 9. Level Structure & Phases

### 9.1 Level Data (typed JSON via Vite)

```ts
// levels are plain JSON; Vite imports them with type checking against:
interface Segment {
  type: EntityKind;
  y: number;
  x?: number;
  xStart?: number; xEnd?: number;   // walls
  height?: number;                   // walls/barriers
}
import level1 from './levels/level1.json';
const segments: Segment[] = level1.segments;
```

Segments spawn when `cameraY + SPAWN_LOOKAHEAD` reaches their `y`; entities despawn once `y < cameraY - DESPAWN_MARGIN`. Keeps the live entity count small and levels data-driven — level design happens in JSON, not code.

### 9.2 Phase Loop
1. **Phase 1 — Fortress run** (~2000 y-units): walls, slots, barriers, turrets, drums, radars, launchers. Density and wall heights ramp within the phase.
2. **Phase 2 — Open space:** starfield, **no floor → no shadow** (altimeter becomes the only cue — deliberate spike). Scrolling continues (authentic). 10 fighters in waves of 2–3. Ends when all destroyed or flown past.
3. **Phase 3 — Second fortress + boss.**

### 9.3 Boss: Zaxxon Robot
- Far end of the corridor; slowly tracks player `x`; fires homing missiles on a cycle.
- **Weak point:** the mounted missile/launcher (small AABB). **6 hits** before its firing cycles complete → destruction (5000 pts) → loop to Phase 1 at tier +1.
- Surviving without the kill also loops — killing Zaxxon is optional glory (authentic).

### 9.4 Difficulty Scaling (loop `n`)
- `SCROLL_SPEED *= 1.08 ** n` (cap 1.5×)
- Turret fire rate & projectile speed +10%/loop
- Fuel drain +15%/loop
- Narrower slots; parked planes activate

---

## 10. Scoring, Lives, Game States

- Score per §8 table + end-of-phase fuel bonus (`fuel × 10`).
- States: `attract → playing → paused → gameOver → highScoreEntry → attract` (discriminated union, same pattern as `ShipState`).
- Top-10 high scores in `localStorage` (versioned key, e.g., `zaxxon.scores.v1`; wrap reads in try/catch — Safari private mode throws).

---

## 11. Game Loop (fixed timestep + interpolated render)

```ts
// loop.ts
const DT = 1 / 60;
let acc = 0, last = performance.now();

function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25);  // clamp: tab-switch spiral guard
  last = now;
  while (acc >= DT) { update(DT); acc -= DT; }
  render(acc / DT);                            // interpolation alpha
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Update order (order matters):

```
1. sample input state
2. advance cameraY (scroll) — unless phase pauses it
3. update ship (movement, clamp, fuel, state machine)
4. spawn segments in lookahead window; despawn passed entities
5. update entity AI (turrets, fighters, missiles, boss)
6. advance projectiles (record yPrev first)
7. collision pass (§5.4 priority)
8. resolve deaths, scoring, phase transitions
9. update shadow (floor lookup at ship x,y)
10. render: floor → shadows → entities by depthKey → projectiles → HUD
```

Also: pause the accumulator on `visibilitychange` (hidden), and drive audio from Web Audio with preloaded buffers (never `new Audio()` per shot).

---

## 12. Deliverables & Acceptance Criteria

**Deliverables:**
1. `entities/types.ts`: `Ship`, `AABB`, `Entity`, `Projectile`, `Segment`, game-state unions.
2. `math/collision.ts` per §5 with Vitest suite.
3. `math/projection.ts` with tests (round-trip sanity, depth-key ordering).
4. Fixed-timestep loop per §11.
5. One complete level (all 3 phases) in `levels/level1.json`.
6. HUD: altimeter with wall-height ticks, fuel gauge, score, lives.
7. `npm run build` produces a static bundle deployable to any static host.

**Acceptance criteria (testable):**
- [ ] `vitest` proves: ship at `z = wallHeight + 1` clears, at `wallHeight − 1` dies.
- [ ] Swept test proves no tunneling through a 1-unit-deep target at max projectile speed.
- [ ] Shadow tracks ship `x` exactly and vanishes over floor gaps.
- [ ] Zero allocation inside `update()` (verify: DevTools allocation sampling shows flat heap during play).
- [ ] Fuel-empty triggers forced descent, not instant game-over.
- [ ] No sprite popping when the ship crosses wall tops (depth-sort stability).
- [ ] Window blur clears input state; tab-hide pauses simulation.
- [ ] `tsc --noEmit` passes in strict mode; full loop Phase 1→2→3→boss→tier 2 playable.
