import { describe, it, expect } from 'vitest';
import { worldToScreen, depthKey, TILE_W, TILE_H, Z_SCALE } from '../src/math/projection';

const ORIGIN = { x: 240, y: 100 };

describe('worldToScreen', () => {
  it('projects the camera-relative origin to the screen origin', () => {
    const { sx, sy } = worldToScreen({ x: 0, y: 50, z: 0 }, 50, ORIGIN);
    expect(sx).toBe(ORIGIN.x);
    expect(sy).toBe(ORIGIN.y);
  });

  it('moves +x right-and-down along the dimetric axis', () => {
    const a = worldToScreen({ x: 0, y: 0, z: 0 }, 0, ORIGIN);
    const b = worldToScreen({ x: 10, y: 0, z: 0 }, 0, ORIGIN);
    expect(b.sx - a.sx).toBe(10 * (TILE_W / 2));
    expect(b.sy - a.sy).toBe(10 * (TILE_H / 2));
  });

  it('moves +y (forward) left-and-down: away from camera', () => {
    const a = worldToScreen({ x: 0, y: 0, z: 0 }, 0, ORIGIN);
    const b = worldToScreen({ x: 0, y: 10, z: 0 }, 0, ORIGIN);
    expect(b.sx - a.sx).toBe(-10 * (TILE_W / 2));
    expect(b.sy - a.sy).toBe(10 * (TILE_H / 2));
  });

  it('altitude moves the point straight up on screen, sx unchanged', () => {
    const lo = worldToScreen({ x: 40, y: 60, z: 0 }, 50, ORIGIN);
    const hi = worldToScreen({ x: 40, y: 60, z: 30 }, 50, ORIGIN);
    expect(hi.sx).toBe(lo.sx);
    expect(lo.sy - hi.sy).toBeCloseTo(30 * Z_SCALE, 10);
  });

  it('is camera-invariant: same relative position projects identically', () => {
    const a = worldToScreen({ x: 25, y: 100, z: 40 }, 90, ORIGIN);
    const b = worldToScreen({ x: 25, y: 2100, z: 40 }, 2090, ORIGIN);
    expect(a).toEqual(b);
  });
});

describe('depthKey', () => {
  it('orders farther (x+y greater) entities later (drawn on top)', () => {
    expect(depthKey({ x: 10, y: 20, z: 0 })).toBeLessThan(depthKey({ x: 10, y: 21, z: 0 }));
  });

  it('orders higher z later at the same x+y (drawn above)', () => {
    expect(depthKey({ x: 10, y: 20, z: 5 })).toBeLessThan(depthKey({ x: 10, y: 20, z: 6 }));
  });

  it('x+y dominates z (a wall 1 unit nearer sorts before anything on it)', () => {
    expect(depthKey({ x: 10, y: 20, z: 90 })).toBeLessThan(depthKey({ x: 10, y: 21, z: 0 }));
  });
});
