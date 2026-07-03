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

  it('overtakes, hovers at the far end for a few seconds, attacks, then exits', () => {
    const { spawner, pools, ship, raider } = setup();
    let reachedAhead = false;
    let fired = false;
    let hoverTicks = 0;
    for (let t = 0; t < 40 && raider.stage < 4; t += DT) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
      if (raider.y > ship.y + 50) reachedAhead = true;
      if (raider.stage === 2) hoverTicks++; // stage 2 = hovering
      if (pools.enemy.some((p) => p.live)) fired = true;
    }
    expect(reachedAhead).toBe(true); // swung around to the far end
    expect(hoverTicks * DT).toBeGreaterThanOrEqual(2); // lingered menacingly ≥2s
    expect(raider.stage).toBe(4); // completed the attack run and passed the player
    expect(fired).toBe(true); // shot at the player on the way in
    expect(raider.y).toBeLessThan(ship.y); // continuing downfield to despawn
  });
});

describe('fighters roam the screen instead of approaching the player', () => {
  function roamSetup(shipX = 50) {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = shipX;
    ship.y = 0;
    ship.z = 30;
    const f = spawner.spawn('fighter', 50, 40, 30)!;
    return { spawner, pools, ship, f };
  }

  it('sweeps wide across the corridor and altitude band, staying ahead on screen', () => {
    const { spawner, pools, ship, f } = roamSetup();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let stayedAhead = true;
    for (let i = 0; i < 480; i++) {
      // 8s of patrol
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
      minZ = Math.min(minZ, f.z);
      maxZ = Math.max(maxZ, f.z);
      if (f.y < ship.y + 5 || f.y > ship.y + 80) stayedAhead = false;
    }
    expect(maxX - minX).toBeGreaterThan(40); // spans the field, not a lane near the player
    expect(maxZ - minZ).toBeGreaterThan(22);
    expect(stayedAhead).toBe(true);
  });

  it('takes aimed potshots (lateral velocity toward an off-axis player)', () => {
    const { spawner, pools, ship } = roamSetup(12); // player hugs the left edge
    let aimedShot = false;
    for (let i = 0; i < 480; i++) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
      if (pools.enemy.some((p) => p.live && p.vx < -3)) aimedShot = true;
    }
    expect(aimedShot).toBe(true);
  });

  it('leaves the field after its patrol time instead of lingering forever', () => {
    const { spawner, pools, ship, f } = roamSetup();
    for (let t = 0; t < 20 && f.live; t += DT) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
    }
    expect(f.live).toBe(false); // dove away downfield and despawned
  });
});

describe('cannon lobs predictive bombs', () => {
  it('the parabolic bomb intercepts a straight-flying player', () => {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.x = 50;
    ship.y = 0;
    ship.z = 30;
    ship.bank = 0;
    ship.pitch = 0;
    const scroll = 30;
    expect(spawner.spawn('cannon', 30, 50, 5)).not.toBeNull(); // 50 ahead of the ship

    updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER, undefined, scroll);
    const bomb = spawner.entities.find((e) => e.live && e.kind === 'bomb');
    expect(bomb).toBeDefined();
    expect(bomb!.vz).toBeGreaterThan(0); // lobbed upward — an arc, not a dart

    // fly straight: the bomb must come down on the ship's future position
    let minDist = Infinity;
    for (let t = 0; t < 2.5 && bomb!.live; t += DT) {
      ship.y += scroll * DT;
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER, undefined, scroll);
      const d = Math.hypot(bomb!.x - ship.x, bomb!.y - ship.y, bomb!.z - ship.z);
      minDist = Math.min(minDist, d);
    }
    expect(minDist).toBeLessThan(4);
  });

  it('a bomb that misses bursts out on the ground (z <= 0) instead of flying forever', () => {
    const spawner = createSpawner([]);
    const pools = createPools();
    const ship = createShip();
    ship.y = -100; // far away — nothing to hit
    const bomb = spawner.spawn('bomb', 50, 60, 10)!;
    bomb.vz = -5;
    for (let i = 0; i < 300 && bomb.live; i++) {
      updateEnemies(spawner.entities, ship, pools, spawner, DT, TIER);
    }
    expect(bomb.live).toBe(false);
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
