export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const TILE_W = 32;
export const TILE_H = 16;
export const Z_SCALE = 2.2; // screen px per altitude unit

export function worldToScreen(p: Vec3, cameraY: number, origin: { x: number; y: number }) {
  const relY = p.y - cameraY;
  return {
    sx: origin.x + (p.x - relY) * (TILE_W / 2),
    sy: origin.y + (p.x + relY) * (TILE_H / 2) - p.z * Z_SCALE,
  };
}

/** Depth key for painter's algorithm: sort ascending. */
export function depthKey(p: Vec3): number {
  return (p.x + p.y) * 1000 + p.z;
}
