# Zaxxon Clone — Design (v1)

**Date:** 2026-07-02
**Status:** Approved

## Scope

Implement the game exactly as specified in [`SPECS.md`](../../../SPECS.md) (v3 — TypeScript/Vite). SPECS.md is the authoritative design for coordinates, projection, collision, entities, phases, boss, fuel, scoring, HUD, and the game loop. This document records only the decisions the spec leaves open.

## Decisions

### 1. Art: procedural pixel-art atlas

No binary assets. At boot, `render/sprites.ts` draws every sprite into a single offscreen canvas atlas using pixel-level `fillRect` calls, then exposes it as a normal spritesheet API:

- Sprites: ship (3 bank frames: left/level/right), ship shadow, gun turret, radar dish, fuel drum, missile launcher, homing missile, enemy fighter, parked plane, Zaxxon robot (body + weak-point launcher), explosion animation frames, wall face tile (with horizontal altitude stripes per §4), energy-barrier band, floor tile.
- API shape: `initAtlas(): Atlas` at boot; `atlas.draw(ctx, name, frame, sx, sy)` at render time. The renderer never knows sprites are procedural — a hand-drawn PNG atlas can replace generation later without touching the renderer.
- Pixel look preserved via the spec's fixed 480×640 internal resolution and `imageSmoothingEnabled = false`.

### 2. Audio: synthesized SFX

No sound files. At boot, `audio.ts` renders each effect into an `AudioBuffer` using `OfflineAudioContext` (oscillators, noise bursts, gain envelopes), then plays from pooled `AudioBufferSourceNode`s per the spec's "preloaded buffers, never `new Audio()`" rule.

- Effects: player laser, enemy shot, explosion, fuel pickup, low-fuel klaxon, boss hit, extra-life jingle.
- The `AudioContext` is created/resumed on first user input to satisfy browser autoplay policy; until then the game runs silent without errors.

### 3. Spec options resolved

- **Altitude quantization (§2.2):** not in v1. Player `z` is continuous. The mechanic is isolated behind the movement clamp, so a 32-step quantizer can be added later as a constant + rounding without structural change.
- **Viewport:** 480×640 (3:4) internal resolution, integer-scaled and letterboxed to the window.
- **Settings:** no settings screen. The attract screen lists two toggles — `I` inverts the Y axis (default authentic: up = dive), `M` mutes audio. Both persist to `localStorage` alongside high scores (versioned keys, try/catch-wrapped reads per §10).

## Everything else

Architecture, module layout, types, math, collision priorities, pooling budgets, phase loop, difficulty scaling, acceptance criteria: as written in SPECS.md §1–§12. Deliverables and testable acceptance criteria in SPECS.md §12 are the definition of done for v1.

## v1.1 — Playtest-driven spec deviations (2026-07-02)

Playtesting exposed places where SPECS.md's sample values are internally inconsistent; in each case the spec's stated intent (pillars, mechanics) won over its sample numbers. All are covered by regression tests (`tests/visibility.test.ts`, `tests/gameplay.test.ts`, `tests/boss.test.ts`).

1. **Projection constants (§2.1).** The sample `TILE_W = 32` renders the 100-unit corridor 1600 px wide — unfittable on the spec's own 480×640 viewport; nothing was on-screen. Retuned to `TILE_W = 8`, `TILE_H = 4`.
2. **Projection direction (§2.1).** The sample formula makes "forward" render toward the bottom-left — 180° from the arcade's fortress-enters-top-right slant. Forward axis flipped (`sx: x + relY`, `sy: x − relY`), `depthKey = (x − y)·1000 + z`.
3. **Player shot pitch (§6).** Floor targets' hittable band tops out at z ≈ 6.6, but the ship clamps to z ≥ 8 and the spec's level shots never descend — drums/turrets were provably unhittable. Player shots now drop at 8 u/s (`PLAYER_SHOT_DROP`), preserving §7's dive-low risk/reward.
4. **Boss staging (§9.3).** Camera now stops 30 units from the boss (not 60 — outside the visible window) and boss x-tracking clamps to `[15, 68]` so it cannot follow the player off-screen. The invulnerable body is a pass-through shield; only the core consumes shots — otherwise the body's AABB made the 6-hit core kill unreachable.
5. **Lives (§3.3).** Game over at `lives ≤ 0`: 3 ships = 3 deaths (the spec's `lives < 0` sample gave 4).
