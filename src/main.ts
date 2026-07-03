import { startLoop } from './loop';
import { initInput, isDown } from './input';
import { loadSettings } from './settings';
import { initAtlas } from './render/sprites';
import { createRenderer, VIEW_W, VIEW_H } from './render/renderer';
import { createShip, updateShip, SCROLL_SPEED } from './entities/ship';
import type { Entity } from './entities/types';
import { createPools, firePlayer, updateProjectiles } from './entities/projectiles';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no 2d context');
ctx.imageSmoothingEnabled = false;

function fitCanvas(): void {
  if (!canvas) return;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
addEventListener('resize', fitCanvas);
fitCanvas();

loadSettings();
initInput();

const atlas = initAtlas();
const renderer = createRenderer(ctx, atlas);
const ship = createShip();
const entities: Entity[] = [];
const pools = createPools();
let cameraY = 0;

startLoop(
  (dt) => {
    updateShip(ship, dt, SCROLL_SPEED);
    if (isDown('Space')) firePlayer(pools, ship);
    updateProjectiles(pools, dt, cameraY);
    cameraY = ship.y;
  },
  (alpha) => {
    renderer.render(
      {
        ship,
        entities,
        playerShots: pools.player,
        enemyShots: pools.enemy,
        cameraY,
        hasFloor: true,
        floorGaps: [],
      },
      alpha,
    );
  },
);
