import { startLoop } from './loop';
import { initInput } from './input';
import { loadSettings } from './settings';

export const VIEW_W = 480;
export const VIEW_H = 640;

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

let t = 0;
startLoop(
  (dt) => {
    t += dt;
  },
  () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#0f0';
    ctx.fillText(`loop ok t=${t.toFixed(1)}`, 10, 20);
  },
);
