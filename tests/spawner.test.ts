import { describe, it, expect } from 'vitest';
import { createSpawner, SPAWN_LOOKAHEAD, DESPAWN_MARGIN } from '../src/world/spawner';
import type { Segment } from '../src/entities/types';

const segs: Segment[] = [
  { type: 'fuelDrum', y: 200, x: 30 },
  { type: 'wall', y: 300, xStart: 0, xEnd: 100, height: 40 },
];

describe('spawner', () => {
  it('spawns a segment only once cameraY + lookahead reaches its y', () => {
    const s = createSpawner(segs);
    s.update(200 - SPAWN_LOOKAHEAD - 1);
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
    s.update(200 - SPAWN_LOOKAHEAD + 1);
    const live = s.entities.filter((e) => e.live);
    expect(live).toHaveLength(1);
    expect(live[0]?.kind).toBe('fuelDrum');
  });

  it('despawns entities behind the camera', () => {
    const s = createSpawner(segs);
    s.update(300); // both spawned
    s.update(300 + DESPAWN_MARGIN + 10);
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
  });

  it('builds wall AABBs from xStart/xEnd/height', () => {
    const s = createSpawner(segs);
    s.update(300);
    const wall = s.entities.find((e) => e.live && e.kind === 'wall');
    expect(wall).toBeDefined();
    expect(wall?.z).toBe(20);
    expect(wall?.hh).toBe(20);
    expect(wall?.wallHeight).toBe(40);
  });

  it('reset() rewinds so a new loop replays the level', () => {
    const s = createSpawner(segs);
    s.update(300);
    s.reset();
    expect(s.entities.filter((e) => e.live)).toHaveLength(0);
    s.update(200);
    expect(s.entities.filter((e) => e.live && e.kind === 'fuelDrum')).toHaveLength(1);
    // offset: after reset(1000), drum originally at y=200 is now at y=1200
    s.reset(1000);
    s.update(1200);
    expect(s.entities.filter((e) => e.live && e.kind === 'fuelDrum')).toHaveLength(1);
  });
});
