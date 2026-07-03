import type { Entity, Ship } from './entities/types';
import { createShip, updateShip, killShip, updateFuel, SCROLL_SPEED } from './entities/ship';
import { createPools, firePlayer, updateProjectiles, type Pools } from './entities/projectiles';
import { createImpacts, spawnImpact, updateImpacts, type Impact } from './entities/effects';
import { updateEnemies } from './entities/enemies';
import { createSpawner, type Spawner } from './world/spawner';
import { createPhases, PHASE3_END, BOSS_Y } from './world/phases';
import { overlap, projectileHit } from './math/collision';
import { isDown } from './input';
import level1 from './levels/level1.json';
import type { Segment } from './entities/types';
import { play } from './audio';

export const EXTRA_SHIP_AT = 10000;

// Module-scope callback so no closure is allocated per frame (zero-alloc update path).
const onEnemyShot = () => play('enemyShot');

export interface Game {
  ship: Ship;
  spawner: Spawner;
  pools: Pools;
  cameraY: number;
  score: number;
  bonusAwarded: boolean;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
  wallHeights: number[];
  impacts: Impact[];
  time: number;
  reset(): void;
  rebaseForLoop(baseY: number): void;
  /** Dev cheat: jump just ahead of the boss trigger with full fuel. No-op mid-boss-fight. */
  skipToBoss(): void;
  update(dt: number): void;
}

export function createGame(): Game {
  const ship = createShip();
  const pools = createPools();
  let phases = createPhases();
  const spawner = createSpawner(
    level1.segments as unknown as Segment[],
    () => phases.tier.slotShrink,
  );

  const game: Game = {
    ship,
    spawner,
    pools,
    cameraY: 0,
    score: 0,
    bonusAwarded: false,
    hasFloor: true,
    floorGaps: level1.floorGaps,
    wallHeights: [],
    impacts: createImpacts(),
    time: 0,

    reset(): void {
      Object.assign(ship, createShip());
      spawner.reset();
      for (const p of pools.player) p.live = false;
      for (const p of pools.enemy) p.live = false;
      for (const i of game.impacts) i.live = false;
      game.score = 0;
      game.bonusAwarded = false;
      game.cameraY = 0;
      game.time = 0;
      game.wallHeights.length = 0;
      phases = createPhases();
    },

    rebaseForLoop(baseY: number): void {
      spawner.reset(baseY);
    },

    skipToBoss(): void {
      // Rewinding into an active boss fight would strand scrollPaused=true
      if (phases.name === 'boss') return;
      ship.y = phases.loopN * PHASE3_END + BOSS_Y - 60; // 15 units before the trigger
      ship.fuel = 100;
    },

    update(dt: number): void {
      game.time += dt;
      // §11 order: input is sampled inside the helpers below
      updateFuel(ship, dt, phases.tier.fuelDrainMul, phases.fuelFrozen); // fuel drain (frozen during boss)
      updateShip(ship, dt, phases.scrollPaused ? 0 : SCROLL_SPEED * phases.tier.scrollMul); // 2+3: scroll via ship.y, movement, clamps
      // fuel impact death check (spec §7)
      if (ship.fuel <= 0 && ship.z <= 1 && ship.state.kind === 'alive') {
        killShip(ship);
        play('explosion');
      }
      game.cameraY = ship.y;
      game.hasFloor = phases.hasFloor; // space phase hides floor and shadow
      spawner.update(game.cameraY); // 4: spawn/despawn window
      // rebuild wallHeights without allocation; the boss core's altitude also
      // gets a tick — the altimeter doubles as the aiming aid for the weak point
      game.wallHeights.length = 0;
      for (const e of spawner.entities) {
        if (!e.live) continue;
        if (e.kind === 'wall' && !game.wallHeights.includes(e.wallHeight)) {
          game.wallHeights.push(e.wallHeight);
        } else if (e.kind === 'bossCore') {
          game.wallHeights.push(e.z);
        }
      }
      // 5: entity AI — Task 10
      updateEnemies(spawner.entities, ship, pools, spawner, dt, phases.tier, onEnemyShot);
      if (isDown('Space') && firePlayer(pools, ship)) play('laser'); // 6a
      updateProjectiles(pools, dt, game.cameraY); // 6b: records yPrev first
      updateImpacts(game.impacts, dt);
      collide(game); // 7: §5.4 priority
      // bonus extra ship (once per game)
      if (!game.bonusAwarded && game.score >= EXTRA_SHIP_AT) {
        game.bonusAwarded = true;
        ship.lives += 1;
        play('extraLife');
      }
      // 8: phase transitions
      phases.update(game, dt);
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
        play('explosion');
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
        play('explosion');
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
        // The boss body (kind==='boss') is an invulnerable pass-through shield:
        // shots continue scanning so the core ahead of it can be targeted.
        if (e.kind === 'boss') continue;
        p.live = false;
        if (e.kind === 'wall' || e.kind === 'barrier') {
          // walls block shots — burst on the wall's near face
          spawnImpact(game.impacts, p.x, Math.min(p.y, e.y - e.hd), p.z);
          break;
        }
        e.hp -= 1;
        if (e.hp <= 0) {
          e.live = false;
          game.score += e.points;
          play('explosion');
          onKill(game, e);
        } else if (e.kind === 'bossCore') {
          play('bossHit');
        }
        break;
      }
    }
  }
}

/** Kill hooks (fuel pickup, missile scoring, boss) grow in later tasks. */
function onKill(game: Game, e: Entity): void {
  if (e.kind === 'fuelDrum') {
    game.ship.fuel = Math.min(100, game.ship.fuel + 20);
    play('fuelPickup');
  }
}
