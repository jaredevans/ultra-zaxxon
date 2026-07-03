import type { Entity, Ship } from './types';
import { fireEnemy, type Pools } from './projectiles';
import type { Spawner } from '../world/spawner';

export interface DifficultyTier {
  fireRateMul: number;
  shotSpeedMul: number;
  planesActive: boolean;
}

const TURRET_RANGE = 70; // y-units: fire only when player is this close
const TURRET_INTERVAL = 1.6; // seconds between aimed shots, tier 1
const TURRET_SHOT_SPEED = 55; // world units/sec along the aim vector
const MISSILE_TRIGGER = 60; // launcher fires when player within this y
const MISSILE_SPEED = 45; // toward player, -y
const MISSILE_TURN = 30; // max lateral/vertical steer units/sec²-ish cap
const FIGHTER_SPEED = 38; // convergence speed on (x, z)
const FIGHTER_INTERVAL = 2.2;
const PLANE_TAKEOFF_RANGE = 55;

/** Module-level steer helper — avoids a per-missile closure allocation each frame. */
function steer(cur: number, target: number, maxDelta: number): number {
  const d = target - cur;
  return Math.abs(d) < maxDelta ? d : Math.sign(d) * maxDelta;
}

export function updateEnemies(
  entities: readonly Entity[],
  ship: Ship,
  pools: Pools,
  spawner: Spawner,
  dt: number,
  tier: DifficultyTier,
  onShot?: () => void,
): void {
  for (const e of entities) {
    if (!e.live) continue;
    switch (e.kind) {
      case 'turret': {
        const dy = e.y - ship.y;
        if (dy < 5 || dy > TURRET_RANGE) break; // only ahead of player, in range
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = TURRET_INTERVAL / tier.fireRateMul;
          // aimed shot: unit vector from turret to ship, scaled
          const dx = ship.x - e.x;
          const dyv = ship.y - e.y;
          const dz = ship.z - e.z;
          const len = Math.hypot(dx, dyv, dz) || 1;
          const s = (TURRET_SHOT_SPEED * tier.shotSpeedMul) / len;
          fireEnemy(pools, e, dx * s, dyv * s, dz * s);
          onShot?.();
        }
        break;
      }
      case 'missileLauncher': {
        // invariant: every spawner path resets fireTimer to 0; -1 means already fired
        if (e.fireTimer === 0 && e.y - ship.y < MISSILE_TRIGGER && e.y > ship.y) {
          e.fireTimer = -1; // one-shot latch: fired
          const m = spawner.spawn('missile', e.x, e.y - e.hd, 4);
          if (m) {
            m.vy = -MISSILE_SPEED;
          }
        }
        break;
      }
      case 'missile': {
        // homing: steer x/z toward the player at a capped rate; destructible
        e.x += steer(e.x, ship.x, MISSILE_TURN * dt);
        e.z += steer(e.z, ship.z, MISSILE_TURN * dt);
        e.y += e.vy * dt;
        if (e.y < ship.y - 15) e.live = false; // overshot
        break;
      }
      case 'fighter': {
        // converge on player (x, z) with lag, hold distance ahead, fire
        e.y += (e.vy !== 0 ? e.vy : -10) * dt; // drifts toward player
        // takeoff climb from parkedPlane conversion: apply and decay vz over ~1s
        if (e.vz > 0) {
          e.z += e.vz * dt;
          e.vz = Math.max(0, e.vz - 12 * dt);
        }
        e.x += Math.sign(ship.x - e.x) * Math.min(FIGHTER_SPEED * dt, Math.abs(ship.x - e.x));
        e.z += Math.sign(ship.z - e.z) * Math.min(FIGHTER_SPEED * 0.7 * dt, Math.abs(ship.z - e.z));
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y - ship.y > 15 && e.y - ship.y < 60) {
          e.fireTimer = FIGHTER_INTERVAL / tier.fireRateMul;
          fireEnemy(pools, e, 0, -TURRET_SHOT_SPEED * tier.shotSpeedMul, 0);
          onShot?.();
        }
        if (e.y < ship.y - 20) e.live = false; // flown past
        break;
      }
      case 'parkedPlane': {
        if (tier.planesActive && e.y - ship.y < PLANE_TAKEOFF_RANGE && e.y > ship.y && e.vz === 0) {
          e.vz = 12; // take off
          e.points = 300; // airborne bounty (spec §8)
          e.kind = 'fighter';
          e.fireTimer = FIGHTER_INTERVAL;
        }
        break;
      }
      default:
        break; // static kinds: fuelDrum, radar, wall, barrier
    }
  }
}
