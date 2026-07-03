import { describe, it, expect } from 'vitest';
import { createPools, firePlayer, updateProjectiles } from '../src/entities/projectiles';
import { createShip, Z_MIN } from '../src/entities/ship';
import { createSpawner } from '../src/world/spawner';
import { projectileHit } from '../src/math/collision';
import type { AABB } from '../src/math/collision';
import type { Segment } from '../src/entities/types';

/**
 * Regression: floor targets were unhittable — their hit band stopped below
 * the ship's z>=8 clamp, so no shot could ever connect. Player shots now
 * pitch slightly downward and floor targets carry a taller hitbox; diving
 * low is how you strafe ground installations (authentic Zaxxon).
 *
 * Targets are spawned through the real spawner so these tests track the
 * actual DEFS geometry, not hand-copied boxes.
 */
const DT = 1 / 60;

function spawnTarget(type: Segment['type']): AABB {
  const spawner = createSpawner([{ type, y: 40, x: 50 }]);
  spawner.update(0); // y=40 is inside the lookahead window
  const e = spawner.entities.find((en) => en.live);
  if (!e) throw new Error('target did not spawn');
  return e;
}

function fireFrom(z: number) {
  const pools = createPools();
  const ship = createShip();
  ship.x = 50;
  ship.y = 0;
  ship.z = z;
  ship.fireCooldown = 0;
  expect(firePlayer(pools, ship)).toBe(true);
  return pools;
}

function sweepsThrough(pools: ReturnType<typeof createPools>, target: AABB): boolean {
  const shot = pools.player[0];
  if (!shot) return false;
  for (let tick = 0; tick < 120 && shot.live; tick++) {
    updateProjectiles(pools, DT, 0);
    if (projectileHit(shot, target)) return true;
  }
  return false;
}

describe('floor targets are shootable from low altitude (real spawner geometry)', () => {
  it('a shot fired at minimum altitude hits a drum 40 units ahead', () => {
    expect(sweepsThrough(fireFrom(Z_MIN), spawnTarget('fuelDrum'))).toBe(true);
  });

  it('a shot fired from a low dive (z=10) hits a turret 40 units ahead', () => {
    expect(sweepsThrough(fireFrom(10), spawnTarget('turret'))).toBe(true);
  });

  it('a shot fired from a low dive (z=10) hits a missile launcher 40 units ahead', () => {
    expect(sweepsThrough(fireFrom(10), spawnTarget('missileLauncher'))).toBe(true);
  });

  it('a shot fired from high altitude passes over a drum (dive-low risk/reward)', () => {
    expect(sweepsThrough(fireFrom(50), spawnTarget('fuelDrum'))).toBe(false);
  });
});

describe('shots burst on walls', () => {
  it('a shot that hits a wall dies and spawns an impact burst there', async () => {
    const { createGame } = await import('../src/game');
    const game = createGame();
    // level1 wall: y=220, full corridor, height 20 (z band 0..20)
    game.ship.y = 190;
    game.ship.z = 50; // safely above the wall
    const shot = game.pools.player[0]!;
    shot.live = true;
    shot.x = 50;
    shot.z = 10; // inside the wall's z band
    shot.y = 218;
    shot.yPrev = 218;
    shot.vy = 90;

    game.update(DT);

    expect(shot.live).toBe(false);
    const burst = game.impacts.find((i) => i.live);
    expect(burst).toBeDefined();
    expect(burst!.x).toBeCloseTo(50, 0);
    expect(burst!.z).toBeCloseTo(10, 0);
  });
});

describe('zap holes strike ships overhead at any altitude', () => {
  it('flying over a hole at high altitude triggers the bolt and destroys the ship', async () => {
    const { createGame } = await import('../src/game');
    const game = createGame();
    // level1 zapHole: y=380, x=65
    game.ship.y = 378;
    game.ship.x = 65;
    game.ship.z = 85; // altitude is no escape

    for (let i = 0; i < 6; i++) game.update(DT); // scroll into the hole's footprint

    expect(game.ship.state.kind).toBe('exploding');
    const bolt = game.impacts.find((i) => i.live && i.kind === 'bolt');
    expect(bolt).toBeDefined();
    expect(bolt!.x).toBeCloseTo(65, 0);
  });

  it('passing beside the hole is safe', async () => {
    const { createGame } = await import('../src/game');
    const game = createGame();
    game.ship.y = 378;
    game.ship.x = 40; // well clear laterally
    game.ship.z = 85;

    for (let i = 0; i < 6; i++) game.update(DT);

    expect(game.ship.state.kind).toBe('alive');
  });
});

describe('destroyed enemies explode', () => {
  it('killing a drum spawns a scaled boom at its position', async () => {
    const { createGame } = await import('../src/game');
    const game = createGame();
    // level1 drum: y=120, x=40, z center 4.5
    game.ship.y = 95;
    game.ship.z = 50;
    const shot = game.pools.player[0]!;
    shot.live = true;
    shot.x = 40;
    shot.z = 4.5;
    shot.y = 118;
    shot.yPrev = 118;
    shot.vy = 90;

    game.update(DT);

    expect(shot.live).toBe(false);
    const boom = game.impacts.find((i) => i.live && i.scale >= 2);
    expect(boom).toBeDefined();
    expect(boom!.x).toBeCloseTo(40, 0);
  });
});

describe('air targets are hit by matching altitude', () => {
  it('a fighter at the same altitude 40 units ahead is hit', () => {
    const spawner = createSpawner([]);
    const fighter = spawner.spawn('fighter', 50, 40, 30);
    expect(fighter).not.toBeNull();
    expect(sweepsThrough(fireFrom(30), fighter!)).toBe(true);
  });
});
