import type { Entity, Ship } from './entities/types';
import { createShip, updateShip, killShip, SCROLL_SPEED } from './entities/ship';
import { createPools, firePlayer, updateProjectiles, type Pools } from './entities/projectiles';
import { updateEnemies, type DifficultyTier } from './entities/enemies';
import { createSpawner, type Spawner } from './world/spawner';
import { overlap, projectileHit } from './math/collision';
import { isDown } from './input';
import level1 from './levels/level1.json';
import type { Segment } from './entities/types';

const TIER_1: DifficultyTier = { fireRateMul: 1, shotSpeedMul: 1, planesActive: false };

export interface Game {
  ship: Ship;
  spawner: Spawner;
  pools: Pools;
  cameraY: number;
  score: number;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
  update(dt: number): void;
}

export function createGame(): Game {
  const ship = createShip();
  const pools = createPools();
  const spawner = createSpawner(level1.segments as unknown as Segment[]);

  const game: Game = {
    ship,
    spawner,
    pools,
    cameraY: 0,
    score: 0,
    hasFloor: true,
    floorGaps: level1.floorGaps,

    update(dt: number): void {
      // §11 order: input is sampled inside the helpers below
      updateShip(ship, dt, SCROLL_SPEED); // 2+3: scroll via ship.y, movement, clamps
      game.cameraY = ship.y;
      spawner.update(game.cameraY); // 4: spawn/despawn window
      // 5: entity AI — Task 10
      updateEnemies(spawner.entities, ship, pools, spawner, dt, TIER_1);
      if (isDown('Space')) firePlayer(pools, ship); // 6a
      updateProjectiles(pools, dt, game.cameraY); // 6b: records yPrev first
      collide(game); // 7: §5.4 priority
      // 8: deaths/phase transitions — extended in Tasks 10/12
      // 9: shadow is a pure lookup at render time
    },
  };
  return game;
}

function collide(game: Game): void {
  const { ship, spawner, pools } = game;
  const shipAlive = ship.state.kind === 'alive';

  // 1. player vs walls/terrain, 2. player vs enemy entities
  if (shipAlive) {
    for (const e of spawner.entities) {
      if (!e.live) continue;
      if (overlap(ship, e)) {
        if (e.kind !== 'wall' && e.kind !== 'barrier') {
          e.live = false; // both die (spec §5.4-2)
        }
        killShip(ship);
        break;
      }
    }
  }

  // 3. player vs enemy projectiles
  if (ship.state.kind === 'alive') {
    for (const p of pools.enemy) {
      if (p.live && projectileHit(p, ship)) {
        p.live = false;
        killShip(ship);
        break;
      }
    }
  }

  // 4. player projectiles vs targets, 5. vs walls
  for (const p of pools.player) {
    if (!p.live) continue;
    for (const e of spawner.entities) {
      if (!e.live) continue;
      if (projectileHit(p, e)) {
        p.live = false;
        if (e.kind === 'wall' || e.kind === 'barrier') break; // walls block shots
        e.hp -= 1;
        if (e.hp <= 0) {
          e.live = false;
          game.score += e.points;
          onKill(game, e);
        }
        break;
      }
    }
  }
}

/** Kill hooks (fuel pickup, missile scoring, boss) grow in later tasks. */
function onKill(_game: Game, _e: Entity): void {}
