import { startLoop } from './loop';
import { initInput, consumePress } from './input';
import { loadSettings, settings, toggleInvertY, toggleMuted } from './settings';
import { initAtlas } from './render/sprites';
import { createRenderer, VIEW_W, VIEW_H } from './render/renderer';
import { createGame } from './game';
import { drawHud } from './render/hud';
import { LOW_FUEL } from './entities/ship';
import type { GameMode } from './entities/types';
import { loadScores, qualifies, insertScore } from './scores';
import type { ScoreRow } from './scores';
import { initAudio, startKlaxonLoop } from './audio';

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
addEventListener('keydown', initAudio, { once: true });
addEventListener('pointerdown', initAudio, { once: true });

const atlas = initAtlas();
const renderer = createRenderer(ctx, atlas);
const game = createGame();

let mode: GameMode = { kind: 'attract' };
let cachedScores: ScoreRow[] = loadScores();

startLoop(
  (dt) => {
    if (mode.kind !== 'highScoreEntry') {
      if (consumePress('KeyI')) toggleInvertY();
      if (consumePress('KeyM')) toggleMuted();
    }
    switch (mode.kind) {
      case 'attract':
        if (consumePress('Enter')) {
          game.reset();
          mode = { kind: 'playing' };
        }
        break;
      case 'playing':
        if (consumePress('KeyP')) {
          mode = { kind: 'paused' };
          break;
        }
        game.update(dt);
        if (game.ship.lives < 0) {
          mode = qualifies(game.score)
            ? { kind: 'highScoreEntry', name: '' }
            : { kind: 'gameOver', t: 3 };
        }
        break;
      case 'paused':
        if (consumePress('KeyP')) mode = { kind: 'playing' };
        break;
      case 'gameOver':
        mode.t -= dt;
        if (mode.t <= 0) {
          cachedScores = loadScores();
          mode = { kind: 'attract' };
        }
        break;
      case 'highScoreEntry': {
        const entry = mode;
        for (let c = 65; c <= 90; c++) {
          if (entry.name.length < 3 && consumePress(`Key${String.fromCharCode(c)}`)) {
            mode = { kind: 'highScoreEntry', name: entry.name + String.fromCharCode(c) };
          }
        }
        if (consumePress('Backspace')) {
          mode = { kind: 'highScoreEntry', name: entry.name.slice(0, -1) };
        }
        if (consumePress('Enter') && entry.name.length > 0) {
          insertScore(entry.name, game.score);
          cachedScores = loadScores();
          // Drain stale letter presses from name entry to prevent them from
          // unexpectedly toggling settings (e.g., I/M) in attract mode next frame.
          consumePress('KeyI');
          consumePress('KeyM');
          mode = { kind: 'attract' };
        }
        break;
      }
    }
    startKlaxonLoop(mode.kind === 'playing' && game.ship.fuel <= LOW_FUEL && game.ship.fuel > 0);
  },
  (alpha) => {
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
    );
    drawHud(ctx, {
      fuel: game.ship.fuel,
      lowFuel: game.ship.fuel <= LOW_FUEL,
      score: game.score,
      lives: game.ship.lives,
      shipZ: game.ship.z,
      wallHeights: game.wallHeights,
      t: game.time,
    });

    // per-mode overlays
    ctx.save();
    ctx.textBaseline = 'top';
    switch (mode.kind) {
      case 'attract':
        drawAttract(ctx, cachedScores);
        break;
      case 'paused':
        drawPaused(ctx);
        break;
      case 'gameOver':
        drawGameOver(ctx);
        break;
      case 'highScoreEntry':
        drawHighScoreEntry(ctx, mode.name);
        break;
    }
    ctx.restore();
  },
);

function drawAttract(ctx: CanvasRenderingContext2D, scores: ScoreRow[]): void {
  ctx.fillStyle = 'rgba(0,0,16,0.65)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = 'center';

  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = '#ffe040';
  ctx.fillText('ZAXXON', VIEW_W / 2, 80);

  ctx.font = '16px monospace';
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText('ENTER TO START', VIEW_W / 2, 160);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#a0a0a0';
  ctx.fillText(`I: INVERT Y (currently ${settings.invertY ? 'ON' : 'OFF'})`, VIEW_W / 2, 198);
  ctx.fillText(`M: SOUND (currently ${settings.muted ? 'OFF' : 'ON'})`, VIEW_W / 2, 212);
  ctx.fillText('P: PAUSE', VIEW_W / 2, 226);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#ffe040';
  ctx.fillText('HIGH SCORES', VIEW_W / 2, 262);

  if (scores.length === 0) {
    ctx.fillStyle = '#808080';
    ctx.fillText('--- NO SCORES ---', VIEW_W / 2, 282);
  } else {
    scores.forEach((row, i) => {
      ctx.fillStyle = i === 0 ? '#ffe040' : '#e8e8e8';
      const rank = String(i + 1).padStart(2, ' ');
      const name = row.name.padEnd(3, ' ');
      const score = row.score.toString().padStart(6, '0');
      ctx.fillText(`${rank}. ${name}  ${score}`, VIEW_W / 2, 282 + i * 14);
    });
  }
}

function drawPaused(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.font = '24px monospace';
  ctx.fillStyle = '#e8e8e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
}

function drawGameOver(ctx: CanvasRenderingContext2D): void {
  ctx.font = '24px monospace';
  ctx.fillStyle = '#ff4040';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', VIEW_W / 2, VIEW_H / 2);
}

function drawHighScoreEntry(ctx: CanvasRenderingContext2D, name: string): void {
  ctx.fillStyle = 'rgba(0,0,16,0.75)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = 'center';

  ctx.font = '16px monospace';
  ctx.fillStyle = '#ffe040';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW HIGH SCORE', VIEW_W / 2, VIEW_H / 2 - 30);

  ctx.font = '24px monospace';
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(name + '_', VIEW_W / 2, VIEW_H / 2 + 10);
}
