export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// SPECS.md §2.1 sample values (TILE_W=32) put the 100-unit corridor at
// 1600px — unfittable on the mandated 480px viewport. Retuned so the
// corridor (100u × TILE_W/2 = 400px) fits, per the spec's own pillar
// over its sample constants. See docs/superpowers/specs design addendum.
export const TILE_W = 8;
export const TILE_H = 4;
export const Z_SCALE = 2.2; // screen px per altitude unit

export function worldToScreen(p: Vec3, cameraY: number, origin: { x: number; y: number }) {
  const relY = p.y - cameraY;
  return {
    // Authentic Zaxxon slant: forward (+y) drifts up-right; lateral (+x) down-right.
    sx: origin.x + (p.x + relY) * (TILE_W / 2),
    sy: origin.y + (p.x - relY) * (TILE_H / 2) - p.z * Z_SCALE,
  };
}

/** Depth key for painter's algorithm: sort ascending (far = up-right = small key). */
export function depthKey(p: Vec3): number {
  return (p.x - p.y) * 1000 + p.z;
}
