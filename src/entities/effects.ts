/** Short-lived visual effects: wall sparks (scale 1), enemy/boss booms (scale >= 2), lightning bolts. Pooled — no allocation in update(). */
export interface Impact {
  kind: 'burst' | 'bolt';
  x: number;
  y: number;
  z: number; // burst: effect altitude; bolt: TOP of the bolt (base is the floor)
  t: number; // remaining lifetime, seconds
  dur: number; // total lifetime, seconds
  scale: number; // bursts: 1 = wall spark; >= 2 draws the big multi-burst treatment
  live: boolean;
}

export const IMPACT_POOL = 12;
export const IMPACT_TIME = 0.4;

export function createImpacts(): Impact[] {
  return Array.from({ length: IMPACT_POOL }, () => ({
    kind: 'burst' as const,
    x: 0,
    y: 0,
    z: 0,
    t: 0,
    dur: IMPACT_TIME,
    scale: 1,
    live: false,
  }));
}

function take(pool: Impact[]): Impact | null {
  for (const i of pool) if (!i.live) return i;
  return null; // pool exhausted: drop the effect rather than allocate
}

export function spawnImpact(
  pool: Impact[],
  x: number,
  y: number,
  z: number,
  scale = 1,
  dur = IMPACT_TIME,
): void {
  const i = take(pool);
  if (!i) return;
  i.kind = 'burst';
  i.x = x;
  i.y = y;
  i.z = z;
  i.t = dur;
  i.dur = dur;
  i.scale = scale;
  i.live = true;
}

/** Lightning column from the floor at (x, y) up to zTop. */
export function spawnBolt(pool: Impact[], x: number, y: number, zTop: number): void {
  const i = take(pool);
  if (!i) return;
  i.kind = 'bolt';
  i.x = x;
  i.y = y;
  i.z = zTop;
  i.t = 0.35;
  i.dur = 0.35;
  i.scale = 1;
  i.live = true;
}

export function updateImpacts(pool: Impact[], dt: number): void {
  for (const i of pool) {
    if (!i.live) continue;
    i.t -= dt;
    if (i.t <= 0) i.live = false;
  }
}
