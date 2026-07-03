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
      time: 0,
      floorGaps: [],
      impacts: [
        {
          kind: 'burst' as const,
          x: 50,
          y: 40,
          z: 10,
          t: IMPACT_TIME,
          dur: IMPACT_TIME,
          scale: 1,
          live: true,
        },
      ],
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
      stage: 0,
    };
    const world: RenderWorld = {
      ship: createShip(),
      entities: [wall],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      time: 0,
      floorGaps: [],
      impacts: [
        {
          kind: 'burst' as const,
          x: 10,
          y: 38,
          z: 10,
          t: IMPACT_TIME,
          dur: IMPACT_TIME,
          scale: 1,
          live: true,
        },
      ],
    };
    renderer.render(world, 0);
    const firstWallFill = log.indexOf('fill:#5a5a72');
    const burst = log.indexOf('explosion');
    expect(firstWallFill).toBeGreaterThanOrEqual(0);
    expect(burst).toBeGreaterThan(firstWallFill);
  });

  it('a dying ship explodes bigger than the ship itself (scaled multi-burst)', () => {
    const scales: number[] = [];
    const atlas: Atlas = {
      draw: (_ctx, name, _frame, _sx, _sy, scale) => {
        if (name === 'explosion') scales.push(scale ?? 1);
      },
      size: () => ({ w: 16, h: 16 }),
    };
    const renderer = createRenderer(stubCtx(), atlas);
    const ship = createShip();
    ship.state = { kind: 'exploding', t: 0.6 };
    const world: RenderWorld = {
      ship,
      entities: [],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      time: 0,
      floorGaps: [],
      impacts: [],
    };
    renderer.render(world, 0);
    // main fireball scaled well past the ~40px ship model, plus satellite bursts
    expect(Math.max(...scales)).toBeGreaterThanOrEqual(3);
    expect(scales.length).toBeGreaterThanOrEqual(2);
  });

  it('after the final death the ship never reappears (no ghost behind game over)', () => {
    const log: string[] = [];
    const renderer = createRenderer(stubCtx(log), recordingAtlas([]));
    const ship = createShip();
    ship.lives = 0; // out of ships
    ship.state = { kind: 'respawning', t: 0.15 }; // post-explosion, non-blink phase
    const world: RenderWorld = {
      ship,
      entities: [],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: false,
      time: 0,
      floorGaps: [],
      impacts: [],
    };
    renderer.render(world, 0);
    // '#3a3a4c' is the ship model's underside fill — absent means no ship drawn
    expect(log).not.toContain('fill:#3a3a4c');

    // sanity: with a life left, the same state DOES draw the ship
    const log2: string[] = [];
    const renderer2 = createRenderer(stubCtx(log2), recordingAtlas([]));
    ship.lives = 2;
    renderer2.render({ ...world, ship }, 0);
    expect(log2).toContain('fill:#3a3a4c');
  });

  it('renders zap holes without throwing (regression: TDZ const after return froze the game)', () => {
    const log: string[] = [];
    const renderer = createRenderer(stubCtx(log), recordingAtlas([]));
    const hole: Entity = {
      id: 3,
      kind: 'zapHole',
      x: 60,
      y: 40,
      z: 0.15,
      hw: 3.5,
      hd: 3.5,
      hh: 0.3,
      hp: Infinity,
      points: 0,
      live: true,
      fireTimer: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wallHeight: 0,
      stage: 0,
    };
    const world: RenderWorld = {
      ship: createShip(),
      entities: [hole],
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: true,
      time: 1.2,
      floorGaps: [],
      impacts: [],
    };
    expect(() => renderer.render(world, 0)).not.toThrow();
    expect(log).toContain('fill:#0a1020'); // the hole's lip actually drew
  });

  it('renders every enemy kind as a 3D model without throwing', () => {
    const log: string[] = [];
    const renderer = createRenderer(stubCtx(log), recordingAtlas([]));
    const kinds: Entity['kind'][] = [
      'turret',
      'radar',
      'missileLauncher',
      'parkedPlane',
      'fighter',
      'raider',
      'cannon',
      'bomb',
      'missile',
      'boss',
      'bossCore',
    ];
    const entities: Entity[] = kinds.map((kind, i) => ({
      id: i + 1,
      kind,
      x: 20 + i * 6,
      y: 30 + i * 4,
      z: 5,
      hw: 3,
      hd: 3,
      hh: 3,
      hp: 1,
      points: 0,
      live: true,
      fireTimer: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wallHeight: 0,
      stage: 0,
    }));
    const world: RenderWorld = {
      ship: createShip(),
      entities,
      playerShots: [],
      enemyShots: [],
      cameraY: 0,
      hasFloor: true,
      time: 0.7,
      floorGaps: [],
      impacts: [],
    };
    expect(() => renderer.render(world, 0)).not.toThrow();
    expect(log).toContain('fill:#8a8a9a'); // the turret's top face actually drew
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
      time: 0,
      floorGaps: [],
      impacts: [
        {
          kind: 'burst' as const,
          x: 50,
          y: 40,
          z: 10,
          t: 0,
          dur: IMPACT_TIME,
          scale: 1,
          live: false,
        },
      ],
    };
    renderer.render(world, 0);
    expect(calls.some(([name]) => name === 'explosion')).toBe(false);
  });
});
