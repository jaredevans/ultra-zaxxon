import { describe, it, expect } from 'vitest';
import { worldToScreen } from '../src/math/projection';
import { ORIGIN, VIEW_W, VIEW_H } from '../src/render/renderer';

/**
 * Regression guard for the v1 launch bug: spec-sample projection constants
 * put the entire playfield off the 480×640 canvas. These invariants pin the
 * playable region on-screen regardless of future constant tuning.
 */
const onScreen = (p: { x: number; y: number; z: number }, cam: number) => {
  const s = worldToScreen(p, cam, ORIGIN);
  return s.sx >= 0 && s.sx <= VIEW_W && s.sy >= 0 && s.sy <= VIEW_H;
};

describe('playfield visibility invariants', () => {
  const cam = 500;

  it('ship is on-screen across its entire clamp box', () => {
    for (const x of [8, 50, 92]) {
      for (const z of [8, 50, 90]) {
        expect(onScreen({ x, y: cam, z }, cam), `ship x=${x} z=${z}`).toBe(true);
      }
    }
  });

  it('a floor target 40 units ahead at corridor center is visible', () => {
    expect(onScreen({ x: 50, y: cam + 40, z: 3 }, cam)).toBe(true);
  });

  it('near-wall base spans mostly on-screen (both edges at 10 ahead)', () => {
    expect(onScreen({ x: 0, y: cam + 10, z: 0 }, cam)).toBe(true);
    expect(onScreen({ x: 100, y: cam + 10, z: 0 }, cam)).toBe(true);
  });

  it('forward motion moves objects toward the upper-right (authentic Zaxxon)', () => {
    const near = worldToScreen({ x: 50, y: cam + 10, z: 0 }, cam, ORIGIN);
    const far = worldToScreen({ x: 50, y: cam + 40, z: 0 }, cam, ORIGIN);
    expect(far.sx).toBeGreaterThan(near.sx); // ahead drifts right
    expect(far.sy).toBeLessThan(near.sy); // and up
  });
});
