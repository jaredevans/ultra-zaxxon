import type { Entity } from '../entities/types';

/**
 * Height of whatever is directly under (x, y): wall/barrier tops count,
 * otherwise the floor plane (0). Returns null when there is nothing below
 * (open space in phase 2, or a floor gap) — the shadow must vanish.
 */
export function floorHeightAt(
  x: number,
  y: number,
  entities: readonly Entity[],
  hasFloor: boolean,
  floorGaps: readonly { yStart: number; yEnd: number }[] = [],
): number | null {
  let top: number | null = hasFloor ? 0 : null;
  for (const gap of floorGaps) {
    if (y > gap.yStart && y < gap.yEnd) top = null;
  }
  for (const e of entities) {
    if (!e.live || e.kind !== 'wall') continue;
    if (Math.abs(x - e.x) < e.hw && Math.abs(y - e.y) < e.hd) {
      if (top === null || e.wallHeight > top) top = e.wallHeight;
    }
  }
  return top;
}
