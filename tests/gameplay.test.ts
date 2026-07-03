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

describe('air targets are hit by matching altitude', () => {
  it('a fighter at the same altitude 40 units ahead is hit', () => {
    const spawner = createSpawner([]);
    const fighter = spawner.spawn('fighter', 50, 40, 30);
    expect(fighter).not.toBeNull();
    expect(sweepsThrough(fireFrom(30), fighter!)).toBe(true);
  });
});
