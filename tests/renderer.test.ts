import { describe, it, expect } from 'vitest';
import { createRenderer, type RenderWorld } from '../src/render/renderer';
import type { Atlas, SpriteName } from '../src/render/sprites';
import type { Entity } from '../src/entities/types';
import { createShip } from '../src/entities/ship';
import { IMPACT_TIME } from '../src/entities/effects';

/** Headless render-path check: stub ctx (no-op) + recording atlas. */
function stubCtx(log?: string[]): CanvasRenderingContext2D {
  let fillStyle = '';
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'fillStyle') return fillStyle;
        return (..._args: unknown[]) => {
          if (log && prop === 'fill') log.push(`fill:${fillStyle}`);
        };
      },
      set: (_t, prop, value) => {
        if (prop === 'fillStyle') fillStyle = String(value);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

function recordingAtlas(calls: [SpriteName, number][]): Atlas {
  return {
    draw: (_ctx, name, frame) => {
      calls.push([name, frame]);
    },
    size: () => ({ w: 8, h: 8 }),
  };
}

describe('renderer draws live impact bursts', () => {
  it('a live impact produces an explosion sprite draw', () => {
    const calls: [SpriteName, number][] = [];
    const renderer = createRenderer(stubCtx(), recordingAtlas(calls));
    const world: RenderWorld = {
      ship: createShip(),
      entities: [],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      floorGaps: [],
      impacts: [{ x: 50, y: 40, z: 10, t: IMPACT_TIME, live: true }],
    };
    renderer.render(world, 0);
    expect(calls.some(([name]) => name === 'explosion')).toBe(true);
  });

  it('a burst on a wall face is drawn AFTER the wall column it hit (not masked)', () => {
    // Regression: walls were one monolithic depth key at their center x, so a
    // burst at x=10 sorted "behind" a full-corridor wall and was painted over.
    const log: string[] = [];
    const calls: [SpriteName, number][] = [];
    const atlas: Atlas = {
      draw: (_ctx, name, frame) => {
        log.push(name);
        calls.push([name, frame]);
      },
      size: () => ({ w: 8, h: 8 }),
    };
    const renderer = createRenderer(stubCtx(log), atlas);
    const wall: Entity = {
      id: 7,
      kind: 'wall',
      x: 50,
      y: 40,
      z: 10,
      hw: 50,
      hd: 2,
      hh: 10,
      hp: Infinity,
      points: 0,
      live: true,
      fireTimer: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wallHeight: 20,
    };
    const world: RenderWorld = {
      ship: createShip(),
      entities: [wall],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      floorGaps: [],
      impacts: [{ x: 10, y: 38, z: 10, t: IMPACT_TIME, live: true }],
    };
    renderer.render(world, 0);
    const firstWallFill = log.indexOf('fill:#5a5a72');
    const burst = log.indexOf('explosion');
    expect(firstWallFill).toBeGreaterThanOrEqual(0);
    expect(burst).toBeGreaterThan(firstWallFill);
  });

  it('dead impacts draw nothing', () => {
    const calls: [SpriteName, number][] = [];
    const renderer = createRenderer(stubCtx(), recordingAtlas(calls));
    const world: RenderWorld = {
      ship: createShip(),
      entities: [],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      floorGaps: [],
      impacts: [{ x: 50, y: 40, z: 10, t: 0, live: false }],
    };
    renderer.render(world, 0);
    expect(calls.some(([name]) => name === 'explosion')).toBe(false);
  });
});
