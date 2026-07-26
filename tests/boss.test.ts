import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game';
import { spawnBoss, BOSS_CORE_HP } from '../src/entities/boss';

// Boss placed in fortress2 (y=3200) where no level entities occupy x=50 at z=10 or z=18.
// cameraY=3150 keeps localY < BOSS_Y-60 (3440) so the phase system never auto-spawns its
// own boss, avoiding entanglement with the phases state machine.
const BOSS_Y = 3200;
const SHIP_Y = BOSS_Y - 50; // 3150 — in fortress2, avoids boss-phase trigger at localY 3440

describe('boss core reachable through invulnerable body', () => {
  it('shot aimed at core position reduces core hp and is consumed', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;

    const refs = spawnBoss(game.spawner, BOSS_Y);
    expect(refs).not.toBeNull();
    const { body, core } = refs!;

    // Fix 1a: core should be 2 units in front of body's front face
    expect(core.y).toBe(body.y - body.hd - 2);

    // Arm a player projectile at core's x/z, just behind it in y
    const p = game.pools.player[0]!;
    p.live = true;
    p.x = core.x; // 50
    p.z = core.z; // 10
    p.y = core.y - 2; // just inside the swept-test window at vy=90, dt=1/60 (moves 1.5 units)
    p.yPrev = p.y;
    p.vy = 90;

    game.update(1 / 60);

    // Core takes 1 hit; shot is consumed
    expect(core.hp).toBe(BOSS_CORE_HP - 1);
    expect(p.live).toBe(false);
  });

  it('armor eats shots aimed at the body, sparking on the near face', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;

    const refs = spawnBoss(game.spawner, BOSS_Y);
    expect(refs).not.toBeNull();
    const { body, core } = refs!;

    // Aim at body.z (18), not core.z (10) — verify the z planes are distinct
    const p = game.pools.player[0]!;
    p.live = true;
    p.x = body.x; // 50
    p.z = body.z; // 18 — intentionally NOT core.z
    p.y = body.y - 3; // inside body's y-range after the swept advance
    p.yPrev = p.y;
    p.vy = 90;

    // Sanity: z gap exceeds combined half-heights → shot cannot hit core
    expect(Math.abs(p.z - core.z)).toBeGreaterThan(p.hh + core.hh);

    game.update(1 / 60);

    expect(p.live).toBe(false); // the armor absorbs it — no shooting past the boss
    const spark = game.impacts.find(
      (i) => i.live && i.scale === 1 && Math.abs(i.y - (body.y - body.hd)) < 0.01,
    );
    expect(spark).toBeDefined();
    expect(core.hp).toBe(BOSS_CORE_HP); // armor is still invulnerable — no damage through it
  });

  it('core hitbox is forgiving: a shot 3 units off in both x and z still connects', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;

    const refs = spawnBoss(game.spawner, BOSS_Y);
    const { core } = refs!;

    const p = game.pools.player[0]!;
    p.live = true;
    p.x = core.x + 3;
    p.z = core.z + 3;
    p.y = core.y - 2;
    p.yPrev = p.y;
    p.vy = 90;

    game.update(1 / 60);

    expect(core.hp).toBe(BOSS_CORE_HP - 1);
    expect(p.live).toBe(false);
  });

  it('killing the boss core spawns a jumbo boom', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;
    const refs = spawnBoss(game.spawner, BOSS_Y)!;
    refs.core.hp = 1; // last hit

    const p = game.pools.player[0]!;
    p.live = true;
    p.x = refs.core.x;
    p.z = refs.core.z;
    p.y = refs.core.y - 2;
    p.yPrev = p.y;
    p.vy = 90;

    game.update(1 / 60);

    expect(refs.core.hp).toBe(0);
    const boom = game.impacts.find((i) => i.live && i.scale >= 5);
    expect(boom).toBeDefined();
  });

  it('a non-lethal core hit spawns a visible burst, not just audio', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;
    const refs = spawnBoss(game.spawner, BOSS_Y)!;
    const { core } = refs;

    const p = game.pools.player[0]!;
    p.live = true;
    p.x = core.x;
    p.z = core.z;
    p.y = core.y - 2;
    p.yPrev = p.y;
    p.vy = 90;

    game.update(1 / 60);

    expect(core.hp).toBe(BOSS_CORE_HP - 1); // hit landed, boss survives
    // a hit burst: bigger than a wall spark, smaller than the kill fireball (scale 6)
    const hit = game.impacts.find(
      (i) => i.live && i.scale >= 2 && i.scale < 5 && Math.abs(i.y - core.y) < 0.01,
    );
    expect(hit).toBeDefined();
  });

  it('the weak point wins when one sweep reaches both it and the armor', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;
    const refs = spawnBoss(game.spawner, BOSS_Y)!;
    const { body, core } = refs;

    // The body is spawned before the core, so it is scanned first. A shot whose
    // swept interval covers both must still damage the core — absorbing on the
    // armor mid-scan would silently eat legitimate weak-point hits.
    const p = game.pools.player[0]!;
    p.live = true;
    p.x = core.x;
    p.z = core.z;
    p.y = body.y - 7.5;
    p.yPrev = p.y;
    p.vy = 90;

    game.update(1 / 60);

    expect(core.hp).toBe(BOSS_CORE_HP - 1); // the hit counted
    expect(p.live).toBe(false);
    const armorSpark = game.impacts.find(
      (i) => i.live && i.scale === 1 && Math.abs(i.y - (body.y - body.hd)) < 0.01,
    );
    expect(armorSpark).toBeUndefined(); // it hit the core, not the plating
  });

  it('skip-to-boss brings exactly the 3 escort fighters, not the skipped phase-2 waves', () => {
    const game = createGame();
    game.skipToBoss();
    for (let i = 0; i < 90; i++) game.update(1 / 60);
    const fighters = game.spawner.entities.filter((e) => e.live && e.kind === 'fighter');
    expect(fighters.length).toBe(3);
  });

  it('altimeter shows an aim tick at the core height while the boss is alive', () => {
    const game = createGame();
    game.ship.y = SHIP_Y;

    const refs = spawnBoss(game.spawner, BOSS_Y);
    const { core } = refs!;

    game.update(1 / 60);
    expect(game.wallHeights).toContain(core.z);

    core.live = false;
    game.update(1 / 60);
    expect(game.wallHeights).not.toContain(core.z);
  });
});
