import type { Entity, Ship } from './types';
import type { Pools } from './projectiles';
import type { Spawner } from '../world/spawner';

export const BOSS_CORE_HP = 6;
export const BOSS_CYCLES = 5;
const TRACK_SPEED = 8; // slow x tracking
const CYCLE_INTERVAL = 3.0; // seconds between homing-missile volleys

export interface BossRefs {
  body: Entity;
  core: Entity;
  cycles: number;
}

export function spawnBoss(spawner: Spawner, y: number): BossRefs | null {
  const body = spawner.spawn('boss', 50, y, 18);
  const core = spawner.spawn('bossCore', 50, y - 6, 10);
  if (!body || !core) return null;
  body.hw = 12;
  body.hd = 6;
  body.hh = 18;
  body.hp = Infinity;
  body.points = 0;
  core.hw = 2;
  core.hd = 2;
  core.hh = 2;
  core.hp = BOSS_CORE_HP;
  core.points = 6000; // 1000 + 5000 kill
  body.fireTimer = CYCLE_INTERVAL;
  return { body, core, cycles: 0 };
}

export function updateBoss(
  refs: BossRefs,
  ship: Ship,
  _pools: Pools,
  spawner: Spawner,
  dt: number,
): 'fighting' | 'killed' | 'escaped' {
  const { body, core } = refs;
  if (!core.live) {
    body.live = false;
    return 'killed';
  } // collision pass killed the core

  // slow x tracking; core rides the body
  const dx = ship.x - body.x;
  body.x += Math.sign(dx) * Math.min(TRACK_SPEED * dt, Math.abs(dx));
  core.x = body.x;
  core.y = body.y - 6;

  body.fireTimer -= dt;
  if (body.fireTimer <= 0) {
    body.fireTimer = CYCLE_INTERVAL;
    refs.cycles += 1;
    if (refs.cycles > BOSS_CYCLES) {
      body.live = false;
      core.live = false;
      return 'escaped'; // survived: loop without the 5000 (spec §9.3)
    }
    const m = spawner.spawn('missile', body.x, body.y - body.hd, 8);
    if (m) m.vy = -45;
  }
  return 'fighting';
}
