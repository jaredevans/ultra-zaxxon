import { describe, it, expect } from 'vitest';
import level1 from '../src/levels/level1.json';
import type { Segment } from '../src/entities/types';
import { createSpawner } from '../src/world/spawner';
import { overlap } from '../src/math/collision';
import { createShip, SHIP_HH } from '../src/entities/ship';
import { APPROACH_END } from '../src/world/phases';

const segments = level1.segments as unknown as Segment[];

describe('perimeter walls (arcade approach: climb over to enter, fly out over the exit)', () => {
  const fullSpanWallAt = (y: number) =>
    segments.find((s) => s.type === 'wall' && s.y === y && s.xStart === 0 && s.xEnd === 100);

  it('a full-span entry wall guards the fortress just past the approach', () => {
    const wall = fullSpanWallAt(170);
    expect(wall).toBeDefined();
    expect(wall?.height).toBe(25);
  });

  it('the fortress 1 exit and fortress 2 entry walls are present', () => {
    expect(fullSpanWallAt(1960)).toBeDefined();
    expect(fullSpanWallAt(2880)).toBeDefined();
  });

  it('ship clears the entry wall at wallHeight + SHIP_HH + 1 and dies at wallHeight - 1', () => {
    const wall = fullSpanWallAt(170);
    if (!wall) throw new Error('entry wall missing');
    const spawner = createSpawner([wall]);
    spawner.update(170); // wall y is inside the lookahead window
    const e = spawner.entities.find((en) => en.live);
    if (!e) throw new Error('entry wall did not spawn');
    const ship = createShip();
    ship.y = 170;
    const h = wall.height ?? 30;
    ship.z = h + SHIP_HH + 1;
    expect(overlap(ship, e)).toBe(false);
    ship.z = h - 1;
    expect(overlap(ship, e)).toBe(true);
  });

  it('nothing spawns in open space: no segment sits before the entry wall', () => {
    const minY = Math.min(...segments.map((s) => s.y));
    expect(minY).toBe(170);
    expect(minY).toBeGreaterThan(APPROACH_END);
  });
});
