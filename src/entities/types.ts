export type { Vec3 } from '../math/projection';
export type { AABB, SweptBox } from '../math/collision';
import type { AABB } from '../math/collision';

export type ShipState =
  | { kind: 'alive' }
  | { kind: 'exploding'; t: number } // 0.8s, input locked
  | { kind: 'respawning'; t: number }; // 2s invulnerable, blink

export interface Ship extends AABB {
  state: ShipState;
  fuel: number; // 0–100
  lives: number;
  fireCooldown: number;
  bank: number; // smoothed roll, -1..1, from lateral input
  pitch: number; // smoothed attack angle, -1 (dive)..1 (climb)
}

export interface Projectile extends AABB {
  yPrev: number;
  vy: number; // + for player, − for aimed enemy shots
  vx: number;
  vz: number;
  owner: 'player' | 'enemy';
  live: boolean; // pool flag
}

export type EntityKind =
  | 'fuelDrum'
  | 'turret'
  | 'radar'
  | 'missileLauncher'
  | 'parkedPlane'
  | 'wall'
  | 'barrier'
  | 'fighter'
  | 'missile'
  | 'boss'
  | 'bossCore'; // Zaxxon weak point (small AABB)

export interface Entity extends AABB {
  id: number;
  kind: EntityKind;
  hp: number;
  points: number;
  live: boolean; // spawner pool flag
  fireTimer: number; // turrets/fighters/boss cadence; 0 for static kinds
  vx: number; // fighters/missiles/airborne planes; 0 for static kinds
  vy: number;
  vz: number;
  wallHeight: number; // walls/barriers only; 0 otherwise (drives stripe rendering + altimeter ticks)
}

/** One row of levels/level1.json */
export interface Segment {
  type: EntityKind;
  y: number;
  x?: number;
  xStart?: number;
  xEnd?: number; // walls
  height?: number; // walls/barriers
}

export type GameMode =
  | { kind: 'attract' }
  | { kind: 'playing' }
  | { kind: 'paused' }
  | { kind: 'gameOver'; t: number }
  | { kind: 'highScoreEntry'; name: string };
