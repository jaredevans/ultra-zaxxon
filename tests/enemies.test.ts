import { describe, it, expect } from 'vitest';
import { createSpawner } from '../src/world/spawner';
import { updateEnemies, type DifficultyTier } from '../src/entities/enemies';
import { createPools } from '../src/entities/projectiles';
import { createShip } from '../src/entities/ship';
import { spawnBoss } from '../src/entities/boss';
import { updateBoss } from '../src/entities/boss';

const DT = 1 / 60;
const TIER: DifficultyTier = { fireRateMul: 1, shotSpeedMul: 1, planesActive: false };

describe('fighters move independently', () => {
  it('two fighters spawned at the same spot diverge instead of stacking', () => {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = 50;
    ship.y = 0;
    ship.z = 30;
    const f1 = spawner.spawn('fighter', 50, 80, 30);
    const f2 = spawner.spawn('fighter', 50, 80, 30);
    expect(f1).not.toBeNull();
    expect(f2).not.toBeNull();

    for (let i = 0; i < 90; i++) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
    }

    const apart = Math.abs(f1!.x - f2!.x) + Math.abs(f1!.z - f2!.z);
    expect(apart).toBeGreaterThan(1.5);
  });
});

describe('raider life cycle: parked → overtake → attack run → exit', () => {
  function setup() {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = 50;
    ship.y = 40;
    ship.z = 30;
    const raider = spawner.spawn('raider', 70, 30, 5)!; // already behind the ship
    return { spawner, pools, ship, raider };
  }

  it('stays parked while still ahead of the player', () => {
    const { spawner, pools, ship, raider } = setup();
    raider.y = 90; // ahead — player hasn't passed it
    for (let i = 0; i < 30; i++) updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
    expect(raider.stage).toBe(0);
    expect(raider.y).toBe(90); // parked means parked
  });

  it('takes off once passed, with the airborne bounty', () => {
    const { spawner, pools, ship, raider } = setup();
    updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
    expect(raider.stage).toBe(1);
    expect(raider.points).toBe(300);
  });

  it('overtakes to well ahead, turns around, attacks, then exits downfield', () => {
    const { spawner, pools, ship, raider } = setup();
    let reachedAhead = false;
    let fired = false;
    for (let t = 0; t < 30 && raider.stage < 3; t += DT) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
      if (raider.y > ship.y + 50) reachedAhead = true;
      if (pools.enemy.some((p) => p.live)) fired = true;
    }
    expect(reachedAhead).toBe(true); // swung around to the far end
    expect(raider.stage).toBe(3); // completed the attack run and passed the player
    expect(fired).toBe(true); // shot at the player on the way in
    expect(raider.y).toBeLessThan(ship.y); // continuing downfield to despawn
  });
});

describe('boss maneuvers', () => {
  it('sweeps laterally and bobs in altitude even when the player holds still', () => {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = 50; // aligned with the boss spawn column — pure pursuit would freeze it
    ship.y = 3150;

    const refs = spawnBoss(spawner, 3200)!;
    let maxDX = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < 240; i++) {
      updateBoss(refs, ship, pools, spawner, DT);
      maxDX = Math.max(maxDX, Math.abs(refs.body.x - 50));
      minZ = Math.min(minZ, refs.body.z);
      maxZ = Math.max(maxZ, refs.body.z);
    }
    expect(maxDX).toBeGreaterThan(3); // lateral sweep
    expect(maxZ - minZ).toBeGreaterThan(4); // altitude bob
  });

  it('the core rides the body through its maneuvers', () => {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = 20;
    ship.y = 3150;

    const refs = spawnBoss(spawner, 3200)!;
    for (let i = 0; i < 120; i++) updateBoss(refs, ship, pools, spawner, DT);
    expect(refs.core.x).toBe(refs.body.x);
    expect(refs.core.z).toBeLessThan(refs.body.z); // weak point hangs below center
  });
});
