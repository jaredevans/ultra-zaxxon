import type { Entity, Projectile, Ship, Vec3 } from '../entities/types';
import { worldToScreen, depthKey, Z_SCALE, TILE_W, TILE_H } from '../math/projection';
import type { Atlas, SpriteName } from './sprites';
import { floorHeightAt } from '../world/shadow';

export const VIEW_W = 480;
export const VIEW_H = 640;
// Ship row (relY=0): sx = 40 + x*4 ∈ [72, 408] for x∈[8,92]; sy = 370 + x*2 - z*2.2.
export const ORIGIN = { x: 40, y: 370 };

export interface RenderWorld {
  ship: Ship;
  entities: readonly Entity[];
  playerShots: readonly Projectile[];
  enemyShots: readonly Projectile[];
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

/**
 * The player ship is a tiny flat-shaded 3D delta-wing model projected
 * through the same isometric transform as the world, rotated by the
 * smoothed pitch (attack angle) and bank (roll). Unlike a sprite, the
 * heading always matches the flight direction and the attitude reads
 * continuously.
 */
const SHIP_MODEL = {
  nose: { x: 0, y: 5, z: 0.4 },
  ltip: { x: -5, y: -3.2, z: 0 },
  rtip: { x: 5, y: -3.2, z: 0 },
  tail: { x: 0, y: -2.8, z: 1.2 },
  fin: { x: 0, y: -3.4, z: 3.2 },
  spine: { x: 0, y: 0.5, z: 1.0 },
  canL: { x: -0.9, y: 1.4, z: 0.9 },
  canR: { x: 0.9, y: 1.4, z: 0.9 },
  canF: { x: 0, y: 3.6, z: 0.5 },
};
const MAX_PITCH = 0.5; // radians of visible attack angle at full climb/dive
const MAX_ROLL = 0.55;

// items[] is reused across frames (the array itself is not reallocated).
// Per-frame DrawItem closures ARE allocated here — intentional:
// the no-allocation constraint applies to update() only, not the render path.
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
        // 10×10 world tile as a screen parallelogram:
        // +x edge Δ(+10·TILE_W/2, +10·TILE_H/2), +y edge Δ(+10·TILE_W/2, −10·TILE_H/2)
        const ex = 10 * (TILE_W / 2);
        const ey = 10 * (TILE_H / 2);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + ex, a.sy + ey); // +x edge
        ctx.lineTo(a.sx + ex + ex, a.sy); // then +y edge
        ctx.lineTo(a.sx + ex, a.sy - ey);
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
            draw: () => drawShip(ship, w.cameraY),
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

      for (const pr of w.playerShots) {
        if (!pr.live) continue;
        items.push({
          key: depthKey(pr),
          id: 100000,
          draw: () => {
            const s = project(pr, w.cameraY);
            ctx.fillStyle = '#80ffff';
            ctx.fillRect(s.sx - 2, s.sy - 4, 4, 8);
          },
        });
      }
      for (const pr of w.enemyShots) {
        if (!pr.live) continue;
        items.push({
          key: depthKey(pr),
          id: 100000,
          draw: () => {
            const s = project(pr, w.cameraY);
            ctx.fillStyle = '#ff6060';
            ctx.fillRect(s.sx - 2, s.sy - 4, 4, 8);
          },
        });
      }

      items.sort((a, b) => a.key - b.key || a.id - b.id);
      for (const it of items) it.draw();
    },
  };

  function drawShip(ship: Ship, cameraY: number): void {
    const th = ship.pitch * MAX_PITCH;
    const ph = ship.bank * MAX_ROLL;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const cp = Math.cos(ph);
    const sp = Math.sin(ph);

    const pt = (v: { x: number; y: number; z: number }) => {
      // roll around the fuselage axis (right input dips the right wing)...
      const x1 = v.x * cp + v.z * sp;
      const z1 = -v.x * sp + v.z * cp;
      // ...then pitch around the lateral axis (climb raises the nose)
      const y2 = v.y * ct - z1 * st;
      const z2 = v.y * st + z1 * ct;
      p.x = ship.x + x1;
      p.y = ship.y + y2;
      p.z = ship.z + z2;
      return project(p, cameraY);
    };

    const tri = (
      a: { sx: number; sy: number },
      b: { sx: number; sy: number },
      c: { sx: number; sy: number },
      fill: string,
    ) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.lineTo(c.sx, c.sy);
      ctx.closePath();
      ctx.fill();
    };

    const nose = pt(SHIP_MODEL.nose);
    const ltip = pt(SHIP_MODEL.ltip);
    const rtip = pt(SHIP_MODEL.rtip);
    const tail = pt(SHIP_MODEL.tail);
    const fin = pt(SHIP_MODEL.fin);
    const spine = pt(SHIP_MODEL.spine);

    // trailing silhouette / underside first, then wings shaded by roll,
    // then fin and canopy on top
    tri(ltip, rtip, nose, '#3a3a4c');
    tri(nose, ltip, tail, ship.bank < 0 ? '#b0b0c4' : '#7c7c92');
    tri(nose, rtip, tail, ship.bank > 0 ? '#7c7c92' : '#c8c8dc');
    tri(tail, fin, spine, '#4a5ae0');
    tri(pt(SHIP_MODEL.canL), pt(SHIP_MODEL.canR), pt(SHIP_MODEL.canF), '#70c8ff');
  }

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
