import type { Entity, Projectile, Ship, Vec3 } from '../entities/types';
import { worldToScreen, depthKey, Z_SCALE, TILE_W, TILE_H } from '../math/projection';
import type { Atlas, SpriteName } from './sprites';
import { floorHeightAt } from '../world/shadow';
import type { Impact } from '../entities/effects';

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
  impacts: readonly Impact[];
  time: number; // accumulated play time — drives pulsing effects
}

const KIND_SPRITE: Partial<Record<Entity['kind'], SpriteName>> = {
  fuelDrum: 'fuelDrum',
  turret: 'turret',
  radar: 'radar',
  missileLauncher: 'launcher',
  parkedPlane: 'plane',
  fighter: 'fighter',
  raider: 'raider',
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

const SCENERY: readonly SpriteName[] = ['hangar', 'tower', 'silo', 'antenna', 'bunker'];

// NOTE: consts used by the hoisted draw functions below MUST live at module
// scope — inside createRenderer they'd sit after its `return` and never
// initialize (TDZ), throwing on first use and killing the rAF loop.
const HOLE_PULSE = ['#16306e', '#2f5cc4', '#6b97f2', '#d7e6ff'] as const;

// spiral galaxy in the upper-right sky, clear of the Saturn disc at (78, 84).
// (Alphas stay high: specks rarely overlap, so they don't stack — a lone
// ~15%-alpha speck over the near-black sky is invisible.)
const GALAXY = { cx: 338, cy: 140, r: 72, tilt: -0.45, squash: 0.42 };
const GALAXY_ARM = [
  'rgba(235,210,255,0.65)', // inner: warm lavender-white
  'rgba(185,140,250,0.5)', // mid: violet
  'rgba(110,130,235,0.38)', // outer: blue
] as const;

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

  /** Deterministic integer hash for tile/scenery variety (no RNG in render). */
  const hash = (n: number): number => (Math.imul(n | 0, 2654435761) >>> 0) >> 8;

  function drawSky(cameraY: number): void {
    ctx.fillStyle = '#05050e';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // spiral galaxy: two parametric arms winding out from a bright core,
    // squashed into a tilted disk — deterministic, stars shine through on top
    {
      const { cx: gx, cy: gy, r: gr, tilt, squash } = GALAXY;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 52; i++) {
          const t = i / 52; // 0 core → 1 rim
          const ang = arm * Math.PI + t * 3.8; // ~0.6 turn per arm
          const rad = 5 + t * (gr - 5);
          const x0 = Math.cos(ang) * rad;
          const y0 = Math.sin(ang) * rad * squash;
          const px = gx + x0 * ct - y0 * st;
          const py = gy + x0 * st + y0 * ct;
          const jx = (hash(arm * 131 + i * 97) % 7) - 3; // roughen the arm line
          const jy = (hash(arm * 57 + i * 53) % 5) - 2;
          const sz = Math.max(2, Math.round(5 - t * 3) + (hash(i * 29 + arm) % 2));
          ctx.fillStyle = GALAXY_ARM[Math.min(2, Math.floor(t * 3))] ?? GALAXY_ARM[2];
          ctx.fillRect(px + jx, py + jy, sz, sz);
        }
      }
      // luminous core: small stacked ellipse rows, brightest at center
      for (let py = -6; py <= 6; py += 2) {
        const half = Math.floor(11 * Math.sqrt(1 - (py / 7) * (py / 7)));
        ctx.fillStyle = Math.abs(py) <= 2 ? 'rgba(255,244,230,0.95)' : 'rgba(255,224,200,0.6)';
        ctx.fillRect(gx - half, gy + py, half * 2, 2);
      }
    }

    // two-tier starfield with slow parallax, deterministic per index
    for (let i = 0; i < 90; i++) {
      const bright = i % 4 === 0;
      const sx = (i * 97 + ((i * i) % 31)) % VIEW_W;
      const sy = (i * 211 + Math.floor(cameraY * (bright ? 2.5 : 1.5))) % VIEW_H;
      ctx.fillStyle = bright ? '#e8ecff' : '#7880a8';
      ctx.fillRect(sx, (VIEW_H - sy) % VIEW_H, bright ? 2 : 1, bright ? 2 : 1);
    }

    // Saturn: pale-gold banded disc...
    const cx = 78;
    const cy = 84;
    const r = 26;
    for (let py = -r; py <= r; py += 2) {
      const half = Math.floor(Math.sqrt(r * r - py * py));
      const band = Math.floor((py + r) / 2) % 7;
      ctx.fillStyle =
        band < 2 ? '#a08858' : band < 4 ? '#c4a878' : band < 5 ? '#d8c092' : '#8a744c';
      ctx.fillRect(cx - half, cy + py, half * 2, 2);
    }
    // ...with a ring system: two pale annulus bands split by a Cassini gap.
    // Side segments only, tucking in at the planet's limb — classic sprite Saturn.
    const rxOut = r * 2.15;
    const ryOut = r * 0.52;
    const rxIn = r * 1.35;
    const ryIn = ryOut * (rxIn / rxOut);
    for (let py = -Math.floor(ryOut); py <= ryOut; py += 2) {
      const t = py / ryOut;
      const wo = Math.floor(rxOut * Math.sqrt(1 - t * t));
      const ti = py / ryIn;
      const planetHalf = Math.floor(Math.sqrt(Math.max(0, r * r - py * py)));
      const wi = Math.abs(ti) < 1 ? Math.floor(rxIn * Math.sqrt(1 - ti * ti)) : planetHalf + 1;
      const wm = wi + Math.floor((wo - wi) * 0.45);
      for (const [a, b2, col] of [
        [wi, wm - 2, '#8d7a5c'],
        [wm, wo, '#c9b189'],
      ] as const) {
        if (b2 <= a) continue;
        ctx.fillStyle = col;
        ctx.fillRect(cx - b2, cy + py, b2 - a, 2); // left segment
        ctx.fillRect(cx + a, cy + py, b2 - a, 2); // right segment
      }
    }
  }

  function drawFloor(cameraY: number, hasFloor: boolean, gaps: RenderWorld['floorGaps']): void {
    drawSky(cameraY);
    if (!hasFloor) return;
    const ex = 10 * (TILE_W / 2);
    const ey = 10 * (TILE_H / 2);
    const y0 = Math.floor((cameraY - 20) / 10) * 10;
    const yMax = Math.floor((cameraY + 90) / 10) * 10;
    // far → near so nearer platform rows paint over farther cliff faces
    for (let wy = yMax; wy >= y0; wy -= 10) {
      const inGap = gaps.some((g) => wy + 5 > g.yStart && wy + 5 < g.yEnd);
      if (inGap) continue;

      // decorative apron strip left of the corridor — scenery stands here
      for (let wx = -20; wx < 0; wx += 10) {
        p.x = wx;
        p.y = wy;
        p.z = 0;
        const a = project(p, cameraY);
        ctx.fillStyle = ((wx + wy) / 10) % 2 === 0 ? '#101c28' : '#0d1822';
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + ex, a.sy + ey);
        ctx.lineTo(a.sx + ex + ex, a.sy);
        ctx.lineTo(a.sx + ex, a.sy - ey);
        ctx.closePath();
        ctx.fill();
      }

      // the fortress is a floating platform: cliff faces drop from its edge
      p.y = wy;
      p.z = 0;
      p.x = -20;
      const el = project(p, cameraY);
      ctx.fillStyle = '#1c1c2a';
      ctx.fillRect(el.sx - 1, el.sy, 3, 30); // left edge pillar
      ctx.beginPath();
      ctx.moveTo(el.sx, el.sy);
      ctx.lineTo(el.sx + ex, el.sy - ey); // along +y edge
      ctx.lineTo(el.sx + ex, el.sy - ey + 28);
      ctx.lineTo(el.sx, el.sy + 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4a4a62'; // lit rim
      ctx.beginPath();
      ctx.moveTo(el.sx, el.sy);
      ctx.lineTo(el.sx + ex, el.sy - ey);
      ctx.lineTo(el.sx + ex, el.sy - ey + 3);
      ctx.lineTo(el.sx, el.sy + 3);
      ctx.closePath();
      ctx.fill();

      for (let wx = 0; wx < 100; wx += 10) {
        p.x = wx;
        p.y = wy;
        p.z = 0;
        const a = project(p, cameraY);
        const even = ((wx + wy) / 10) % 2 === 0;
        const runway = wx >= 40 && wx < 60;
        ctx.fillStyle = runway ? (even ? '#24344a' : '#203042') : even ? '#182838' : '#142030';
        // 10×10 world tile as a screen parallelogram:
        // +x edge Δ(+ex, +ey), +y edge Δ(+ex, −ey)
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(a.sx + ex, a.sy + ey); // +x edge
        ctx.lineTo(a.sx + ex + ex, a.sy); // then +y edge
        ctx.lineTo(a.sx + ex, a.sy - ey);
        ctx.closePath();
        ctx.fill();

        const th = hash(wx * 7919 + wy);
        if (wx === 0 || wx === 90) {
          // hazard chevrons along the platform edges
          const outer = wx === 0;
          ctx.fillStyle = '#b89020';
          for (let k = 0; k < 3; k++) {
            const t = 0.15 + k * 0.3;
            const bx = a.sx + (outer ? 0 : ex) + ex * t;
            const by = a.sy + (outer ? 0 : ey) - ey * t;
            ctx.fillRect(bx, by - 1, 4, 3);
          }
        } else if (wx === 50) {
          // runway centerline dash on alternating rows
          if ((wy / 10) % 2 === 0) {
            ctx.fillStyle = '#c8d4e0';
            ctx.fillRect(a.sx + ex * 0.35, a.sy - ey * 0.35 - 1, 8, 3);
          }
        } else if (th % 11 === 0) {
          // recessed panel
          ctx.fillStyle = even ? '#101d2a' : '#0d1822';
          ctx.fillRect(a.sx + ex - 5, a.sy - 2, 10, 5);
        } else if (th % 13 === 5) {
          // vent grate
          ctx.fillStyle = '#0a141e';
          ctx.fillRect(a.sx + ex - 6, a.sy - 1, 3, 2);
          ctx.fillRect(a.sx + ex + 1, a.sy - 1, 3, 2);
        }
      }
    }
  }

  return {
    render(w: RenderWorld, _alpha: number): void {
      items.length = 0;
      drawFloor(w.cameraY, w.hasFloor, w.floorGaps);

      // decorative base scenery on the left apron (no collision) —
      // deterministic per world row, depth-sorted with everything else
      if (w.hasFloor) {
        const s0 = Math.floor((w.cameraY - 20) / 60) * 60;
        for (let sy = s0; sy < w.cameraY + 100; sy += 60) {
          const h = hash(sy);
          const kind = SCENERY[h % SCENERY.length];
          if (!kind) continue;
          const sxw = -15 - (h % 5);
          const syw = sy + (h % 37);
          items.push({
            key: depthKey({ x: sxw, y: syw, z: 0 }),
            id: -1000 - sy,
            draw: () => {
              p.x = sxw;
              p.y = syw;
              p.z = 0;
              const s = project(p, w.cameraY);
              atlas.draw(ctx, kind, 0, s.sx, s.sy - atlas.size(kind).h / 2 + 3);
            },
          });
        }
      }

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
          // slice long walls into 10-unit columns, each depth-keyed at its own
          // x — a single key at the wall's center masks point objects (shots,
          // bursts, the ship) that sit in front of the wall at other x values
          const xEnd = e.x + e.hw;
          for (let x0 = e.x - e.hw; x0 < xEnd; x0 += 10) {
            const x1 = Math.min(x0 + 10, xEnd);
            items.push({
              key: depthKey({ x: (x0 + x1) / 2, y: e.y, z: e.z }),
              id: e.id * 1000 + Math.round(x0 - (e.x - e.hw)),
              draw: () => drawWall(e, w.cameraY, x0, x1),
            });
          }
        } else if (e.kind === 'zapHole') {
          items.push({
            key: depthKey(e),
            id: e.id,
            draw: () => drawZapHole(e, w.cameraY, w.time),
          });
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
        const outOfShips = ship.lives <= 0; // final death: only the explosion shows, no respawn ghost
        const blink = ship.state.kind === 'respawning' && Math.floor(ship.state.t * 10) % 2 === 0;
        if (!blink && !outOfShips) {
          items.push({
            key: depthKey(ship),
            id: -1,
            draw: () => drawShip(ship, w.cameraY),
          });
        }
      } else {
        // ship death: a fireball bigger than the ship itself — a large scaled
        // main burst plus staggered satellite bursts around the hull
        const age = (0.8 - ship.state.t) / 0.8; // 0 → 1 over the explosion
        const frame = Math.min(3, Math.floor(age * 4));
        items.push({
          key: depthKey(ship),
          id: -1,
          draw: () => {
            const s = project(ship, w.cameraY);
            atlas.draw(ctx, 'explosion', frame, s.sx, s.sy, 4);
            const satFrame = Math.min(3, Math.floor(age * 4 + 1));
            atlas.draw(ctx, 'explosion', satFrame, s.sx - 18, s.sy + 8, 2);
            atlas.draw(ctx, 'explosion', satFrame, s.sx + 16, s.sy - 6, 2);
            atlas.draw(ctx, 'explosion', Math.max(0, satFrame - 1), s.sx + 6, s.sy + 14, 2);
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

      // impact bursts: wall sparks (scale 1) and enemy/boss booms (scale >= 2)
      for (const im of w.impacts) {
        if (!im.live) continue;
        items.push({
          key: depthKey(im),
          id: 100001,
          draw: () => {
            const s = project(im, w.cameraY);
            const age = 1 - im.t / im.dur; // 0 fresh → 1 expired
            if (im.kind === 'bolt') {
              drawBolt(im, w.cameraY, age);
            } else if (im.scale >= 2) {
              // multi-burst fireball, same treatment as the ship's death
              const frame = Math.min(3, Math.floor(age * 4));
              atlas.draw(ctx, 'explosion', frame, s.sx, s.sy, im.scale);
              const satFrame = Math.min(3, frame + 1);
              const off = 5 * im.scale;
              atlas.draw(ctx, 'explosion', satFrame, s.sx - off, s.sy + off * 0.4, im.scale / 2);
              atlas.draw(
                ctx,
                'explosion',
                satFrame,
                s.sx + off * 0.9,
                s.sy - off * 0.3,
                im.scale / 2,
              );
              if (age < 0.25) {
                ctx.fillStyle = '#ffffff';
                const f = 2 * im.scale;
                ctx.fillRect(s.sx - f / 2, s.sy - f / 2, f, f);
              }
            } else {
              atlas.draw(ctx, 'explosion', age < 0.4 ? 1 : 2, s.sx, s.sy);
              if (age < 0.3) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(s.sx - 3, s.sy - 3, 6, 6);
              }
            }
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

  /**
   * Pulsing Tesla pit, drawn as a floor-aligned isometric ellipse: a world
   * circle at z=0 projected through the same transform as the floor tiles.
   * A world offset (dx, dy) maps to screen Δ((dx+dy)·TILE_W/2, (dx−dy)·TILE_H/2).
   */
  function holePath(sx: number, sy: number, r: number, yOff: number): void {
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const dx = r * Math.cos(a);
      const dy = r * Math.sin(a);
      const px = sx + (dx + dy) * (TILE_W / 2);
      const py = sy + (dx - dy) * (TILE_H / 2) + yOff;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawZapHole(e: Entity, cameraY: number, time: number): void {
    p.x = e.x;
    p.y = e.y;
    p.z = 0;
    const s = project(p, cameraY);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + e.id * 1.7); // 0..1, per-hole phase
    // protruding lip: darker, slightly larger, dropped a touch below the cover
    ctx.fillStyle = '#0a1020';
    holePath(s.sx, s.sy, 4.4, 2);
    ctx.fill();
    // the full cover pulses through discrete blue → white steps (pixel-art friendly)
    ctx.fillStyle = HOLE_PULSE[Math.min(3, Math.floor(pulse * 4))] ?? '#2f5cc4';
    holePath(s.sx, s.sy, 3.6, 0);
    ctx.fill();
  }

  /** Jagged lightning column from the floor at (x, y) up to z = im.z. */
  function drawBolt(im: Impact, cameraY: number, age: number): void {
    p.x = im.x;
    p.y = im.y;
    p.z = 0;
    const base = project(p, cameraY);
    const top = base.sy - im.z * Z_SCALE;
    const segs = 6;
    const jag = age < 0.5 ? 5 : 3;
    for (const [width, color] of [
      [5, '#3a6cf0'],
      [2, '#ffffff'],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(base.sx, base.sy);
      for (let i = 1; i <= segs; i++) {
        const yy = base.sy + (top - base.sy) * (i / segs);
        const xoff = i === segs ? 0 : Math.sin(im.t * 60 + i * 2.4) * jag;
        ctx.lineTo(base.sx + xoff, yy);
      }
      ctx.stroke();
    }
    // ground flash at the pit mouth
    if (age < 0.4) {
      ctx.fillStyle = '#e8f4ff';
      ctx.fillRect(base.sx - 8, base.sy - 2, 16, 4);
    }
  }

  /** Draws one 10-unit column slice [x0, x1] of a wall/barrier (see slicing note at the call site). */
  function drawWall(e: Entity, cameraY: number, x0: number, x1: number): void {
    // leading (near) face: projected quad from floor to wallHeight along the slice span
    const h = e.wallHeight;
    const yFace = e.y - e.hd;
    const L = { x: x0, y: yFace, z: 0 };
    const R = { x: x1, y: yFace, z: 0 };
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
    const TL = { x: x0, y: e.y + e.hd, z: h };
    const TR = { x: x1, y: e.y + e.hd, z: h };
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
