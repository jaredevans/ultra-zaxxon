import type { Vec3 } from './projection';

export interface AABB extends Vec3 {
  hw: number; // half-width  (x)
  hd: number; // half-depth  (y)
  hh: number; // half-height (z)
}

export type SweptBox = AABB & { yPrev: number };

export function overlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw &&
    Math.abs(a.y - b.y) < a.hd + b.hd &&
    Math.abs(a.z - b.z) < a.hh + b.hh
  );
}

/** Swept y-interval test: projectiles are fast along y; point tests tunnel. */
export function projectileHit(p: SweptBox, t: AABB): boolean {
  const yLo = Math.min(p.yPrev, p.y);
  const yHi = Math.max(p.yPrev, p.y);
  return (
    Math.abs(p.x - t.x) < p.hw + t.hw &&
    Math.abs(p.z - t.z) < p.hh + t.hh &&
    yLo < t.y + t.hd + p.hd &&
    yHi > t.y - t.hd - p.hd
  );
}

/** Wall as AABB per SPECS §5.2: z centered at height/2, hh = height/2. */
export function wallAABB(xStart: number, xEnd: number, y: number, height: number, hd = 2): AABB {
  return {
    x: (xStart + xEnd) / 2,
    y,
    z: height / 2,
    hw: (xEnd - xStart) / 2,
    hd,
    hh: height / 2,
  };
}
