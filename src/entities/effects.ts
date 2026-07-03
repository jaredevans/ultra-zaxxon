/** Short-lived visual bursts: wall sparks (scale 1) and enemy/boss booms (scale >= 2). Pooled — no allocation in update(). */
export interface Impact {
  x: number;
  y: number;
  z: number;
  t: number; // remaining lifetime, seconds
  dur: number; // total lifetime, seconds
  scale: number; // 1 = wall spark; >= 2 draws the big multi-burst treatment
  live: boolean;
}

export const IMPACT_POOL = 12;
export const IMPACT_TIME = 0.4;

export function createImpacts(): Impact[] {
  return Array.from({ length: IMPACT_POOL }, () => ({
    x: 0,
    y: 0,
    z: 0,
    t: 0,
    dur: IMPACT_TIME,
    scale: 1,
    live: false,
  }));
}

export function spawnImpact(
  pool: Impact[],
  x: number,
  y: number,
  z: number,
  scale = 1,
  dur = IMPACT_TIME,
): void {
  for (const i of pool) {
    if (i.live) continue;
    i.x = x;
    i.y = y;
    i.z = z;
    i.t = dur;
    i.dur = dur;
    i.scale = scale;
    i.live = true;
    return;
  } // pool exhausted: drop the burst rather than allocate
}

export function updateImpacts(pool: Impact[], dt: number): void {
  for (const i of pool) {
    if (!i.live) continue;
    i.t -= dt;
    if (i.t <= 0) i.live = false;
  }
}
