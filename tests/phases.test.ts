import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game';
import { createPhases, APPROACH_END, PHASE3_END } from '../src/world/phases';

const DT = 1 / 60;

describe('approach phase (arcade opening: fly in over space, climb the perimeter wall)', () => {
  it('the game opens over open space — no floor under the ship', () => {
    const game = createGame();
    game.update(DT);
    expect(game.hasFloor).toBe(false);
  });

  it('the fortress floor arrives at APPROACH_END', () => {
    const game = createGame();
    game.ship.y = APPROACH_END + 1;
    game.update(DT);
    expect(game.hasFloor).toBe(true);
  });

  it('entering the fortress pays no phase bonus (approach is not a completed phase)', () => {
    const game = createGame();
    game.ship.y = APPROACH_END - 1;
    game.update(DT);
    game.ship.y = APPROACH_END + 1;
    game.update(DT);
    expect(game.score).toBe(0);
  });

  it('the space phase still has no floor and fortress 2 still does', () => {
    const game = createGame();
    game.ship.y = 2400; // inside space phase (2000..2800)
    game.update(DT);
    expect(game.hasFloor).toBe(false);
    game.ship.y = 2900; // inside fortress 2
    game.update(DT);
    expect(game.hasFloor).toBe(true);
  });

  it('each loop re-opens with an approach: negative localY after rebase is approach', () => {
    const game = createGame();
    const phases = createPhases();
    phases.loopN = 1;
    game.cameraY = PHASE3_END - 50; // localY = -50 relative to loop 1
    phases.update(game, DT);
    expect(phases.name).toBe('approach');
    expect(phases.hasFloor).toBe(false);
  });
});
