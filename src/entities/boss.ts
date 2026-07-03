import type { Entity, Ship } from './types';
import type { Pools } from './projectiles';
import type { Spawner } from '../world/spawner';

export const BOSS_CORE_HP = 6;
export const BOSS_CYCLES = 5;
// Tracking clamp keeps the boss inside the diagonal visible window at its
// camera-stop distance (45 ahead) even when the player hugs a corridor edge.
export const BOSS_X_MIN = 20;
export const BOSS_X_MAX = 60;
const TRACK_SPEED = 14; // x pursuit speed
const SWEEP_X = 18; // lateral weave amplitude around the pursuit target
const SWEEP_RATE = 0.7; // rad/s
const BOB_Z = 6; // altitude bob amplitude around z=18
const BOB_RATE = 1.1; // rad/s
const CYCLE_INTERVAL = 3.0; // seconds between homing-missile volleys

export interface BossRefs {
  body: Entity;
  core: Entity;
  cycles: number;
}

export function spawnBoss(spawner: Spawner, y: number): BossRefs | null {
  const body = spawner.spawn('boss', 50, y, 18);
  const core = spawner.spawn('bossCore', 50, y - 6, 10); // y adjusted below once body dims are set
  if (!body || !core) return null;
  body.hw = 12;
  body.hd = 6;
  body.hh = 18;
  body.hp = Infinity;
  body.points = 0;
  core.y = body.y - body.hd - 2; // 2 units in front of body's front face — outside the body AABB
  // Forgiving weak point: ±2 in every axis made the required aim window
  // ~5 z-units with no visual feedback — unhittable by humans in practice.
  core.hw = 4;
  core.hd = 2;
  core.hh = 4;
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

  // maneuver: pursue the player's x with a sinusoidal sweep layered on top,
  // and bob in altitude — the core (and its altimeter tick) rides along.
  // body.vx is repurposed as the maneuver phase clock.
  body.vx += dt;
  const targetX = ship.x + Math.sin(body.vx * SWEEP_RATE) * SWEEP_X;
  const dx = targetX - body.x;
  body.x += Math.sign(dx) * Math.min(TRACK_SPEED * dt, Math.abs(dx));
  body.x = Math.min(BOSS_X_MAX, Math.max(BOSS_X_MIN, body.x));
  body.z = 18 + Math.sin(body.vx * BOB_RATE) * BOB_Z;
  core.x = body.x;
  core.y = body.y - body.hd - 2; // track core 2 units in front of body's front face
  core.z = body.z - 8; // weak point hangs below the body center

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
