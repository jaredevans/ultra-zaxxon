/** Short-lived visual impact bursts (shot-vs-wall sparks). Pooled — no allocation in update(). */
export interface Impact {
  x: number;
  y: number;
  z: number;
  t: number; // remaining lifetime, seconds
  live: boolean;
}

export const IMPACT_POOL = 8;
export const IMPACT_TIME = 0.4;

export function createImpacts(): Impact[] {
  return Array.from({ length: IMPACT_POOL }, () => ({
    x: 0,
    y: 0,
    z: 0,
    t: 0,
    live: false,
  }));
}

export function spawnImpact(pool: Impact[], x: number, y: number, z: number): void {
  for (const i of pool) {
    if (i.live) continue;
    i.x = x;
    i.y = y;
    i.z = z;
    i.t = IMPACT_TIME;
    i.live = true;
    return;
  } // pool exhausted: drop the spark rather than allocate
}

export function updateImpacts(pool: Impact[], dt: number): void {
  for (const i of pool) {
    if (!i.live) continue;
    i.t -= dt;
    if (i.t <= 0) i.live = false;
  }
}
