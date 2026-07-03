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
  const proj = (yPrev: number, y: number) => ({ x: 0, y, z: 0, hw: 0.5, hd: 0.5, hh: 0.5, yPrev });

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
