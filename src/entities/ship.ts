import type { Ship } from './types';
import { isDown } from '../input';
import { settings } from '../settings';

export const SCROLL_SPEED = 30; // world y-units/sec, base tier
export const X_SPEED = 45;
export const Z_SPEED = 40;
export const X_MIN = 8;
export const X_MAX = 92;
export const Z_MIN = 8;
export const Z_MAX = 90;
export const SHIP_HW = 2.1; // ≈70% of visual half-width (shmup courtesy)
export const SHIP_HD = 2;
export const SHIP_HH = 1.4;
export const EXPLODE_TIME = 0.8;
export const RESPAWN_TIME = 2.0;

export function createShip(): Ship {
  return {
    x: 50,
    y: 0,
    z: 50,
    hw: SHIP_HW,
    hd: SHIP_HD,
    hh: SHIP_HH,
    state: { kind: 'alive' },
    fuel: 100,
    lives: 3,
    fireCooldown: 0,
    bank: 0,
  };
}

export function updateShip(ship: Ship, dt: number, scrollSpeed: number): void {
  // state timers
  if (ship.state.kind === 'exploding') {
    ship.state.t -= dt;
    if (ship.state.t <= 0) ship.state = { kind: 'respawning', t: RESPAWN_TIME };
    return; // input locked; no forward motion while exploding
  }
  if (ship.state.kind === 'respawning') {
    ship.state.t -= dt;
    if (ship.state.t <= 0) ship.state = { kind: 'alive' };
  }

  ship.y += scrollSpeed * dt; // world scroll: the ship advances, never the map

  const dx = (isDown('ArrowRight') ? 1 : 0) - (isDown('ArrowLeft') ? 1 : 0);
  // authentic default: up = dive (z down); settings.invertY flips
  let dz = (isDown('ArrowDown') ? 1 : 0) - (isDown('ArrowUp') ? 1 : 0);
  if (settings.invertY) dz = -dz;

  ship.x = Math.min(X_MAX, Math.max(X_MIN, ship.x + dx * X_SPEED * dt));
  ship.z = Math.min(Z_MAX, Math.max(Z_MIN, ship.z + dz * Z_SPEED * dt));
  ship.bank = dx as -1 | 0 | 1;

  if (ship.fireCooldown > 0) ship.fireCooldown -= dt;
}

/** Death entry point used by the collision pass (Task 9). */
export function killShip(ship: Ship): void {
  if (ship.state.kind !== 'alive') return;
  ship.state = { kind: 'exploding', t: EXPLODE_TIME };
  ship.lives -= 1;
  ship.x = 50;
  ship.z = 50; // y is NOT rewound (spec §3.3)
}
