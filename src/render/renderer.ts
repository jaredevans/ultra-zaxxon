import type { Entity, Projectile, Ship, Vec3 } from '../entities/types';
import { worldToScreen, depthKey, Z_SCALE } from '../math/projection';
import type { Atlas, SpriteName } from './sprites';
import { floorHeightAt } from '../world/shadow';

export const VIEW_W = 480;
export const VIEW_H = 640;
export const ORIGIN = { x: VIEW_W / 2 + 140, y: 150 }; // tuned so corridor x∈[0,100] spans the view

export interface RenderWorld {
  ship: Ship;
  entities: readonly Entity[];
  projectiles: readonly Projectile[];
  cameraY: number;
  hasFloor: boolean;
  floorGaps: readonly { yStart: number; yEnd: number }[];
}

const KIND_SPRITE: Partial<Record<Entity['kind'], SpriteName>> = {
  fuelDrum: 'fuelDrum',
  turret: 'turret',
  radar: 'radar',
  missileLauncher: 'launcher',
  parkedPlane: 'plane',
  fighter: 'fighter',
  missile: 'missile',
  boss: 'boss',
  bossCore: 'bossCore',
};

// Preallocated sort scratch (no allocation in render): index + key pairs.
interface DrawItem {
  key: number;
  id: number;
  draw: () => void;
}

export function createRenderer(ctx: CanvasRenderingContext2D, atlas: Atlas) {
  const items: DrawItem[] = [];
  const p = { x: 0, y: 0, z: 0 }; // scratch Vec3

  function project(v: Vec3, cameraY: number) {
    return worldToScreen(v, cameraY, ORIGIN);
  }

  function drawFloor(cameraY: number, hasFloor: boolean, gaps: RenderWorld['floorGaps']): void {
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!hasFloor) return drawStars(cameraY);
    const y0 = Math.floor((cameraY - 20) / 10) * 10;
    for (let wy = y0; wy < cameraY + 90; wy += 10) {
      const inGap = gaps.some((g) => wy + 5 > g.yStart && wy + 5 < g.yEnd);
      if (inGap) continue;
      for (let wx = 0; wx < 100; wx += 10) {
        p.x = wx;
        p.y = wy;
        p.z = 0;
        const a = project(p, cameraY);
        const even = ((wx + wy) / 10) % 2 === 0;
        ctx.fillStyle = even ? '#182838' : '#142030';
        // 10×10 world tile as a screen parallelogram
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + 5 * 16, a.sy + 5 * 8); // +x edge
        ctx.lineTo(a.sx + 5 * 16 - 5 * 16, a.sy + 5 * 8 + 5 * 8); // +y edge
        ctx.lineTo(a.sx - 5 * 16, a.sy + 5 * 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawStars(cameraY: number): void {
    ctx.fillStyle = '#cfd8ff';
    for (let i = 0; i < 60; i++) {
      // deterministic star field scrolled by cameraY (no RNG in render)
      const sx = (i * 97) % VIEW_W;
      const sy = (i * 211 + Math.floor(cameraY * 4)) % VIEW_H;
      ctx.fillRect(sx, (VIEW_H - sy) % VIEW_H, 2, 2);
    }
  }

  return {
    render(w: RenderWorld, _alpha: number): void {
      items.length = 0;
      drawFloor(w.cameraY, w.hasFloor, w.floorGaps);

      // shadow (above floor, below everything else — drawn before sorted pass)
      const fh = floorHeightAt(w.ship.x, w.ship.y, w.entities, w.hasFloor, w.floorGaps);
      if (fh !== null && w.ship.state.kind !== 'exploding') {
        p.x = w.ship.x;
        p.y = w.ship.y;
        p.z = fh;
        const s = project(p, w.cameraY);
        atlas.draw(ctx, 'shadow', 0, s.sx, s.sy);
      }

      for (const e of w.entities) {
        if (!e.live) continue;
        if (e.kind === 'wall' || e.kind === 'barrier') {
          items.push({ key: depthKey(e), id: e.id, draw: () => drawWall(e, w.cameraY) });
        } else {
          const sprite = KIND_SPRITE[e.kind];
          if (!sprite) continue;
          items.push({
            key: depthKey(e),
            id: e.id,
            draw: () => {
              const s = project(e, w.cameraY);
              atlas.draw(ctx, sprite, 0, s.sx, s.sy);
            },
          });
        }
      }

      const ship = w.ship;
      if (ship.state.kind !== 'exploding') {
        const blink = ship.state.kind === 'respawning' && Math.floor(ship.state.t * 10) % 2 === 0;
        if (!blink) {
          items.push({
            key: depthKey(ship),
            id: -1,
            draw: () => {
              const s = project(ship, w.cameraY);
              atlas.draw(ctx, 'ship', ship.bank + 1, s.sx, s.sy);
            },
          });
        }
      } else {
        const frame = Math.min(3, Math.floor((0.8 - ship.state.t) / 0.2));
        items.push({
          key: depthKey(ship),
          id: -1,
          draw: () => {
            const s = project(ship, w.cameraY);
            atlas.draw(ctx, 'explosion', frame, s.sx, s.sy);
          },
        });
      }

      for (const pr of w.projectiles) {
        if (!pr.live) continue;
        items.push({
          key: depthKey(pr),
          id: 100000,
          draw: () => {
            const s = project(pr, w.cameraY);
            ctx.fillStyle = pr.owner === 'player' ? '#80ffff' : '#ff6060';
            ctx.fillRect(s.sx - 2, s.sy - 4, 4, 8);
          },
        });
      }

      items.sort((a, b) => a.key - b.key || a.id - b.id);
      for (const it of items) it.draw();
    },
  };

  function drawWall(e: Entity, cameraY: number): void {
    // leading (near) face: projected quad from floor to wallHeight along the x span
    const h = e.wallHeight;
    const yFace = e.y - e.hd;
    const L = { x: e.x - e.hw, y: yFace, z: 0 };
    const R = { x: e.x + e.hw, y: yFace, z: 0 };
    const bl = project(L, cameraY);
    const br = project(R, cameraY);
    const zPix = h * Z_SCALE;
    if (e.kind === 'barrier') {
      ctx.fillStyle = 'rgba(80,220,255,0.55)';
      const zLo = (e.z - e.hh) * Z_SCALE;
      const zHi = (e.z + e.hh) * Z_SCALE;
      ctx.beginPath();
      ctx.moveTo(bl.sx, bl.sy - zLo);
      ctx.lineTo(br.sx, br.sy - zLo);
      ctx.lineTo(br.sx, br.sy - zHi);
      ctx.lineTo(bl.sx, bl.sy - zHi);
      ctx.closePath();
      ctx.fill();
      return;
    }
    // face
    ctx.fillStyle = '#5a5a72';
    ctx.beginPath();
    ctx.moveTo(bl.sx, bl.sy);
    ctx.lineTo(br.sx, br.sy);
    ctx.lineTo(br.sx, br.sy - zPix);
    ctx.lineTo(bl.sx, bl.sy - zPix);
    ctx.closePath();
    ctx.fill();
    // top slab
    const TL = { x: e.x - e.hw, y: e.y + e.hd, z: h };
    const TR = { x: e.x + e.hw, y: e.y + e.hd, z: h };
    const tl = project(TL, cameraY);
    const tr = project(TR, cameraY);
    ctx.fillStyle = '#78788f';
    ctx.beginPath();
    ctx.moveTo(bl.sx, bl.sy - zPix);
    ctx.lineTo(br.sx, br.sy - zPix);
    ctx.lineTo(tr.sx, tr.sy);
    ctx.lineTo(tl.sx, tl.sy);
    ctx.closePath();
    ctx.fill();
    // altitude stripes every 10 z-units on the face (spec §4 wall height markers)
    ctx.strokeStyle = '#b8b8d0';
    ctx.lineWidth = 1;
    for (let sz = 10; sz < h; sz += 10) {
      ctx.beginPath();
      ctx.moveTo(bl.sx, bl.sy - sz * Z_SCALE);
      ctx.lineTo(br.sx, br.sy - sz * Z_SCALE);
      ctx.stroke();
    }
  }
}
