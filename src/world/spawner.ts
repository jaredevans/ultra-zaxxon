import type { Entity, Segment } from '../entities/types';
import { wallAABB } from '../math/collision';

export const SPAWN_LOOKAHEAD = 90;
export const DESPAWN_MARGIN = 25;
export const ENTITY_POOL = 64;

interface KindDef {
  hw: number;
  hd: number;
  hh: number;
  hp: number;
  points: number;
}
// Floor targets share hh 5 so their hit band (0..10) overlaps flat shots
// fired from a low dive (z 8–10.6) — the ship clamps to z>=8, so smaller
// hh values are unhittable. Also makes them solid obstacles when flying
// low (authentic: strafe or avoid).
const DEFS: Record<string, KindDef> = {
  fuelDrum: { hw: 2.5, hd: 2.5, hh: 5, hp: 1, points: 50 },
  turret: { hw: 3, hd: 3, hh: 5, hp: 1, points: 200 },
  radar: { hw: 3, hd: 3, hh: 5, hp: 1, points: 100 },
  missileLauncher: { hw: 3.5, hd: 3, hh: 5, hp: 1, points: 300 },
  parkedPlane: { hw: 4, hd: 4, hh: 5, hp: 1, points: 100 },
  fighter: { hw: 3.5, hd: 3, hh: 1.5, hp: 1, points: 200 },
  missile: { hw: 1, hd: 2, hh: 1, hp: 1, points: 150 },
  // trigger footprint only — the overhead bolt check in game.ts ignores z,
  // and the flat profile keeps it out of reach of shots (holes can't be destroyed)
  zapHole: { hw: 3.5, hd: 3.5, hh: 0.3, hp: Infinity, points: 0 },
  // parked profile; takeoff (enemies.ts) switches it to an airborne hitbox + 300 pts
  raider: { hw: 4, hd: 4, hh: 5, hp: 1, points: 150 },
  cannon: { hw: 3, hd: 3, hh: 5, hp: 1, points: 250 },
  bomb: { hw: 1.5, hd: 1.5, hh: 1.5, hp: 1, points: 100 },
};

export interface Spawner {
  update(cameraY: number): void;
  entities: readonly Entity[];
  spawn(kind: Entity['kind'], x: number, y: number, z: number): Entity | null;
  reset(offsetY?: number): void;
}

function blankEntity(): Entity {
  return {
    id: 0,
    kind: 'fuelDrum',
    x: 0,
    y: 0,
    z: 0,
    hw: 1,
    hd: 1,
    hh: 1,
    hp: 0,
    points: 0,
    live: false,
    fireTimer: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    wallHeight: 0,
    stage: 0,
  };
}

export function createSpawner(
  segments: readonly Segment[],
  getSlotShrink: () => number = () => 0,
): Spawner {
  const pool: Entity[] = Array.from({ length: ENTITY_POOL }, blankEntity);
  let cursor = 0; // next segment index to consider (segments must be sorted by y)
  let offset = 0; // y offset added to all segment positions (set by reset)
  let nextId = 1;
  const sorted = [...segments].sort((a, b) => a.y - b.y);

  function take(): Entity | null {
    for (const e of pool) if (!e.live) return e;
    return null; // pool exhausted — skip spawn rather than allocate
  }

  function spawnSegment(seg: Segment): void {
    const e = take();
    if (!e) return;
    e.id = nextId++;
    e.kind = seg.type;
    e.live = true;
    e.fireTimer = 0;
    e.vx = 0;
    e.vy = 0;
    e.vz = 0;
    e.wallHeight = 0;
    e.stage = 0;
    if (seg.type === 'wall' || seg.type === 'barrier') {
      let xStart = seg.xStart ?? 0;
      let xEnd = seg.xEnd ?? 100;
      // slot shrink: widen partial walls toward the gap on higher loops
      if (seg.type === 'wall' && (xStart > 0 || xEnd < 100)) {
        const shrink = getSlotShrink();
        if (seg.xStart === 0) xEnd += shrink;
        else xStart -= shrink;
      }
      const box = wallAABB(xStart, xEnd, seg.y + offset, seg.height ?? 30);
      Object.assign(e, box);
      e.wallHeight = seg.height ?? 30;
      if (seg.type === 'barrier') {
        // force-field band at fixed z: fly under or over (spec §8)
        e.z = seg.height ?? 30;
        e.hh = 4;
      }
      e.hp = Infinity;
      e.points = 0;
    } else {
      const def = DEFS[seg.type];
      if (!def) return void (e.live = false);
      e.x = seg.x ?? 50;
      e.y = seg.y + offset;
      e.z = seg.type === 'turret' || seg.type === 'radar' ? (seg.height ?? 0) + def.hh : def.hh;
      e.hw = def.hw;
      e.hd = def.hd;
      e.hh = def.hh;
      e.hp = def.hp;
      e.points = def.points;
    }
  }

  return {
    entities: pool,
    update(cameraY: number): void {
      while (cursor < sorted.length) {
        const seg = sorted[cursor];
        if (!seg || seg.y + offset > cameraY + SPAWN_LOOKAHEAD) break;
        spawnSegment(seg);
        cursor++;
      }
      for (const e of pool) {
        if (e.live && e.y + e.hd < cameraY - DESPAWN_MARGIN) e.live = false;
      }
    },
    spawn(kind, x, y, z): Entity | null {
      const e = take();
      if (!e) return null;
      const def = DEFS[kind] ?? { hw: 2, hd: 2, hh: 2, hp: 1, points: 0 };
      e.id = nextId++;
      e.kind = kind;
      e.live = true;
      e.x = x;
      e.y = y;
      e.z = z;
      e.hw = def.hw;
      e.hd = def.hd;
      e.hh = def.hh;
      e.hp = def.hp;
      e.points = def.points;
      e.fireTimer = 0;
      e.vx = 0;
      e.vy = 0;
      e.vz = 0;
      e.wallHeight = 0;
      e.stage = 0;
      return e;
    },
    reset(offsetY = 0): void {
      offset = offsetY;
      cursor = 0;
      for (const e of pool) e.live = false;
    },
  };
}
