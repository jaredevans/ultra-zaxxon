import type { Projectile, Ship, Vec3 } from './types';
import { SCROLL_SPEED } from './ship';

export const PLAYER_POOL = 8;
export const ENEMY_POOL = 32;
export const MAX_PLAYER_LIVE = 4; // the real difficulty knob for turret duels
export const FIRE_INTERVAL = 0.25; // ≈4 shots/sec autofire
export const PROJ_SPEED = SCROLL_SPEED * 3;
export const PROJ_RANGE = 120; // y-units before despawn

export interface Pools {
  player: Projectile[];
  enemy: Projectile[];
}

function blank(owner: 'player' | 'enemy'): Projectile {
  return {
    x: 0,
    y: 0,
    z: 0,
    yPrev: 0,
    hw: 0.6,
    hd: 0.8,
    hh: 0.6,
    vx: 0,
    vy: 0,
    vz: 0,
    owner,
    live: false,
  };
}

export function createPools(): Pools {
  return {
    player: Array.from({ length: PLAYER_POOL }, () => blank('player')),
    enemy: Array.from({ length: ENEMY_POOL }, () => blank('enemy')),
  };
}

function liveCount(pool: readonly Projectile[]): number {
  let n = 0;
  for (const p of pool) if (p.live) n++;
  return n;
}

/** Returns true if a shot was fired (for SFX + cooldown reset by the caller). */
export function firePlayer(pools: Pools, ship: Ship): boolean {
  if (ship.state.kind !== 'alive') return false;
  if (ship.fireCooldown > 0) return false;
  if (liveCount(pools.player) >= MAX_PLAYER_LIVE) return false;
  for (const p of pools.player) {
    if (p.live) continue;
    p.x = ship.x;
    p.y = ship.y + ship.hd; // nose
    p.yPrev = p.y;
    p.z = ship.z;
    p.vx = 0;
    p.vy = PROJ_SPEED;
    p.vz = 0;
    p.live = true;
    ship.fireCooldown = FIRE_INTERVAL;
    return true;
  }
  return false;
}

export function fireEnemy(pools: Pools, from: Vec3, vx: number, vy: number, vz: number): void {
  for (const p of pools.enemy) {
    if (p.live) continue;
    p.x = from.x;
    p.y = from.y;
    p.yPrev = from.y;
    p.z = from.z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.live = true;
    return;
  } // pool exhausted: drop the shot (32 is generous; never allocate)
}

function advancePool(pool: readonly Projectile[], dt: number, cameraY: number): void {
  for (const p of pool) {
    if (!p.live) continue;
    p.yPrev = p.y; // MUST precede advancement (swept test, spec §5.3)
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const range = p.owner === 'player' ? p.y - cameraY > PROJ_RANGE : false;
    const behind = p.y < cameraY - 20;
    const grounded = p.z < 0;
    if (range || behind || grounded) p.live = false;
  }
}

export function updateProjectiles(pools: Pools, dt: number, cameraY: number): void {
  // Two sequential loops instead of a per-call array — zero allocation in update path.
  advancePool(pools.player, dt, cameraY);
  advancePool(pools.enemy, dt, cameraY);
}
