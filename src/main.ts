import { startLoop } from './loop';
import { initInput } from './input';
import { loadSettings } from './settings';
import { initAtlas } from './render/sprites';
import { createRenderer, VIEW_W, VIEW_H } from './render/renderer';
import { createGame } from './game';

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
const game = createGame();

startLoop(
  (dt) => game.update(dt),
  (alpha) =>
    renderer.render(
      {
        ship: game.ship,
        entities: game.spawner.entities,
        playerShots: game.pools.player,
        enemyShots: game.pools.enemy,
        cameraY: game.cameraY,
        hasFloor: game.hasFloor,
        floorGaps: game.floorGaps,
      },
      alpha,
    ),
);
