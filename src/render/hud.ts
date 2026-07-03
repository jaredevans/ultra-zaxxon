export interface HudState {
  fuel: number;
  lowFuel: boolean;
  score: number;
  lives: number;
  shipZ: number;
  wallHeights: readonly number[];
  t: number;
}

const ALT_X = 452; // right edge altimeter
const ALT_TOP = 80;
const ALT_H = 400; // px for z 0..90
const Z_MAX_HUD = 90;

export function drawHud(ctx: CanvasRenderingContext2D, hud: HudState): void {
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';

  // score + lives (top-left)
  ctx.fillStyle = '#ffe040';
  ctx.fillText(`SCORE ${hud.score.toString().padStart(6, '0')}`, 8, 8);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(`SHIPS ${'▲'.repeat(Math.max(0, hud.lives))}`, 8, 22);

  // altimeter (right edge): bar + wall-height ticks + integer readout
  const zToY = (z: number): number => ALT_TOP + ALT_H - (z / Z_MAX_HUD) * ALT_H;
  const flash = hud.lowFuel && Math.floor(hud.t * 4) % 2 === 0;
  ctx.strokeStyle = flash ? '#ff4040' : '#70c8ff';
  ctx.strokeRect(ALT_X, ALT_TOP, 12, ALT_H);
  for (const h of hud.wallHeights) {
    ctx.fillStyle = '#ff9020';
    ctx.fillRect(ALT_X - 4, zToY(h), 20, 2); // tick at each wall height in play
  }
  ctx.fillStyle = flash ? '#ff4040' : '#70c8ff';
  ctx.fillRect(ALT_X + 2, zToY(hud.shipZ) - 2, 8, 4); // ship marker
  ctx.fillText(String(Math.round(hud.shipZ)), ALT_X - 14, zToY(hud.shipZ) - 4);

  // fuel gauge (bottom)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText('FUEL', 8, 610);
  ctx.strokeStyle = '#e8e8e8';
  ctx.strokeRect(44, 610, 200, 10);
  ctx.fillStyle = hud.lowFuel ? (flash ? '#ff4040' : '#ff9020') : '#20a040';
  ctx.fillRect(45, 611, (198 * hud.fuel) / 100, 8);

  ctx.restore();
}
