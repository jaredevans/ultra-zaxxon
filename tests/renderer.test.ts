import { describe, it, expect } from 'vitest';
import { createRenderer, type RenderWorld } from '../src/render/renderer';
import type { Atlas, SpriteName } from '../src/render/sprites';
import { createShip } from '../src/entities/ship';
import { IMPACT_TIME } from '../src/entities/effects';

/** Headless render-path check: stub ctx (no-op) + recording atlas. */
function stubCtx(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: () => () => undefined, // every method is a no-op
      set: () => true, // fillStyle etc. assignments succeed
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
