import { describe, it, expect } from 'vitest';
import { createPools, firePlayer, updateProjectiles } from '../src/entities/projectiles';
import { createShip, Z_MIN } from '../src/entities/ship';
import { projectileHit } from '../src/math/collision';
import type { AABB } from '../src/math/collision';

/**
 * Regression: floor targets were unhittable — drum hit band tops out at
 * z≈6.6 but level shots from the ship's minimum altitude (z=8) never
 * descend. Player shots now pitch slightly downward (authentic Zaxxon),
 * so diving low lets you hit drums.
 */
const DT = 1 / 60;
// Drum per spawner DEFS: hw 2.5, hd 2.5, hh 3 → z center 3
const drum: AABB = { x: 50, y: 40, z: 3, hw: 2.5, hd: 2.5, hh: 3 };

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

describe('floor targets are shootable from low altitude', () => {
  it('a shot fired at minimum altitude hits a drum 40 units ahead', () => {
    expect(sweepsThrough(fireFrom(Z_MIN), drum)).toBe(true);
  });

  it('a shot fired from high altitude passes over the same drum (dive-low risk/reward)', () => {
    expect(sweepsThrough(fireFrom(50), drum)).toBe(false);
  });
});
