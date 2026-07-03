import type { Entity, Ship } from './types';
import { fireEnemy, type Pools } from './projectiles';
import { X_SPEED, Z_SPEED, X_MIN, X_MAX, Z_MIN, Z_MAX } from './ship';
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
const FIGHTER_PATH_SPEED = 60; // how fast a fighter chases its patrol path point
const FIGHTER_PATROL_TIME = 12; // seconds of roaming before it dives away
const FIGHTER_INTERVAL = 2.2;
const PLANE_TAKEOFF_RANGE = 55;
// raider: parked ground ship that takes off once the player passes it,
// sweeps wide around the ship to get ahead, then turns for a head-on run
const RAIDER_PASS_MARGIN = 5; // "passed by" once this far behind the player
const RAIDER_OVERTAKE_SPEED = 75; // world u/s while looping downfield
const RAIDER_AHEAD_DIST = 55; // how far ahead it gets before turning
const RAIDER_ATTACK_SPEED = 55; // world u/s on the head-on run
const RAIDER_SIDE_OFFSET = 14; // lateral berth while sweeping past the ship
const RAIDER_INTERVAL = 1.8; // shot cadence during the attack run
const RAIDER_AIR_POINTS = 300;
const RAIDER_HOVER_TIME = 2.5; // seconds it lingers at the far end before diving
// cannon: ground mortar lobbing a ballistic bomb at the player's PREDICTED
// position — lead = current velocity (scroll + smoothed bank/pitch input)
const CANNON_RANGE = 85; // fires while the player is 25..85 behind it
const CANNON_NEAR = 25;
const CANNON_INTERVAL = 2.6;
const BOMB_FLIGHT_TIME = 1.5; // seconds from muzzle to predicted intercept
const BOMB_GRAVITY = 34; // world u/s²

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
  scrollSpeed = 0, // player's forward speed — cannons lead their bombs with it
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
        // roam the visible field, not the player: each fighter chases its own
        // Lissajous path point sweeping the corridor and altitude band ahead
        // of the ship, taking AIMED potshots from wherever it is. After its
        // patrol time it dives away downfield.
        // e.vx = path phase clock; e.vy = patrol lifetime clock.
        e.vx += dt;
        e.vy += dt;
        // takeoff climb from parkedPlane conversion: apply and decay vz over ~1s
        if (e.vz > 0) {
          e.z += e.vz * dt;
          e.vz = Math.max(0, e.vz - 12 * dt);
        }
        if (e.vy > FIGHTER_PATROL_TIME) {
          e.y -= 70 * dt; // patrol over: dive past the player and away
        } else {
          const aimX = 50 + Math.sin(e.vx * (0.55 + (e.id % 3) * 0.25) + e.id) * 38;
          const aimZ = 42 + Math.cos(e.vx * (0.4 + (e.id % 2) * 0.3) + e.id * 2) * 28;
          const aimY = ship.y + 42 + Math.sin(e.vx * 0.5 + e.id) * 24;
          e.x += steer(e.x, aimX, FIGHTER_PATH_SPEED * dt);
          e.z += steer(e.z, Math.min(85, Math.max(10, aimZ)), FIGHTER_PATH_SPEED * 0.6 * dt);
          e.y += steer(e.y, aimY, (scrollSpeed + 45) * dt);
        }
        e.fireTimer -= dt;
        const dy = e.y - ship.y;
        if (e.fireTimer <= 0 && dy > 10 && dy < 70 && e.vy <= FIGHTER_PATROL_TIME) {
          e.fireTimer = FIGHTER_INTERVAL / tier.fireRateMul;
          // aimed shot — roaming means straight shots would never connect
          const dx = ship.x - e.x;
          const dyv = ship.y - e.y;
          const dz = ship.z - e.z;
          const len = Math.hypot(dx, dyv, dz) || 1;
          const s = (TURRET_SHOT_SPEED * tier.shotSpeedMul) / len;
          fireEnemy(pools, e, dx * s, dyv * s, dz * s);
          onShot?.();
        }
        if (e.y < ship.y - 20) e.live = false; // exited downfield
        break;
      }
      case 'raider': {
        // stage 0: parked. 1: takeoff + overtake. 2: hover at the far end.
        // 3: attack run. 4: exit.
        if (e.stage === 0) {
          if (e.y < ship.y - RAIDER_PASS_MARGIN) {
            e.stage = 1;
            e.points = RAIDER_AIR_POINTS;
            e.hw = 3.5;
            e.hh = 1.5; // airborne profile
            e.vx = ship.x >= 50 ? -1 : 1; // sweep past on the roomier side
          }
          break;
        }
        if (e.stage === 1) {
          e.y += RAIDER_OVERTAKE_SPEED * dt;
          e.z += steer(e.z, ship.z + 6, 30 * dt);
          const lane = Math.min(95, Math.max(5, ship.x + e.vx * RAIDER_SIDE_OFFSET));
          e.x += steer(e.x, lane, 40 * dt);
          if (e.y > ship.y + RAIDER_AHEAD_DIST) {
            e.stage = 2;
            e.fireTimer = RAIDER_HOVER_TIME; // hover countdown
          }
          break;
        }
        if (e.stage === 2) {
          // hover: hold station at the far end (match the player's scroll),
          // weaving over the corridor while the countdown runs
          e.y += scrollSpeed * dt;
          e.vy += dt; // weave phase clock (vy is unused while hovering)
          e.x += steer(e.x, ship.x + Math.sin(e.vy * 2.2) * 18, 26 * dt);
          e.z += steer(e.z, ship.z, 18 * dt);
          e.fireTimer -= dt;
          if (e.fireTimer <= 0) {
            e.stage = 3;
            e.vy = 0; // back to drift semantics for later stages
            // fire early in the dive: the closing window is short (~0.5s in-game)
            e.fireTimer = 0.15;
          }
          break;
        }
        if (e.stage === 3) {
          e.y -= RAIDER_ATTACK_SPEED * dt;
          e.x += steer(e.x, ship.x, 30 * dt);
          e.z += steer(e.z, ship.z, 25 * dt);
          e.fireTimer -= dt;
          const dy = e.y - ship.y;
          if (e.fireTimer <= 0 && dy > 15 && dy < 60) {
            e.fireTimer = RAIDER_INTERVAL / tier.fireRateMul;
            fireEnemy(pools, e, 0, -TURRET_SHOT_SPEED * tier.shotSpeedMul, 0);
            onShot?.();
          }
          if (e.y < ship.y - 8) e.stage = 4; // run complete — flew past the player
          break;
        }
        // stage 4: keep flying downfield; the despawn margin reaps it
        e.y -= RAIDER_ATTACK_SPEED * dt;
        break;
      }
      case 'cannon': {
        const dy = e.y - ship.y;
        if (dy < CANNON_NEAR || dy > CANNON_RANGE) break;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = CANNON_INTERVAL / tier.fireRateMul;
          // predicted intercept: current velocity held for the flight time
          const T = BOMB_FLIGHT_TIME;
          const tx = Math.min(X_MAX, Math.max(X_MIN, ship.x + ship.bank * X_SPEED * T));
          const ty = ship.y + scrollSpeed * T;
          const tz = Math.min(Z_MAX, Math.max(Z_MIN, ship.z + ship.pitch * Z_SPEED * T));
          const b = spawner.spawn('bomb', e.x, e.y - e.hd, e.z + 2);
          if (b) {
            // ballistic solve: arrive at (tx,ty,tz) after T under BOMB_GRAVITY
            b.vx = (tx - b.x) / T;
            b.vy = (ty - b.y) / T;
            b.vz = (tz - b.z) / T + 0.5 * BOMB_GRAVITY * T;
            onShot?.();
          }
        }
        break;
      }
      case 'bomb': {
        e.vz -= BOMB_GRAVITY * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.z += e.vz * dt;
        if (e.z <= 0 || e.y < ship.y - 25) e.live = false; // ground burst or long miss
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
