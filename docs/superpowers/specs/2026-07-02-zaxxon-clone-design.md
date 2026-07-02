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
