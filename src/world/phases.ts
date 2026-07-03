import type { DifficultyTier } from '../entities/enemies';
import type { Game } from '../game';
import { spawnBoss, updateBoss, type BossRefs } from '../entities/boss';

export const PHASE1_END = 2000;
export const PHASE2_END = 2800;
export const PHASE3_END = 3600;
export const BOSS_Y = 3500;

export interface FullTier extends DifficultyTier {
  scrollMul: number;
  fuelDrainMul: number;
  slotShrink: number;
}

type PhaseName = 'fortress1' | 'space' | 'fortress2' | 'boss';

export interface Phases {
  update(game: Game, dt: number): void;
  hasFloor: boolean;
  fuelFrozen: boolean;
  scrollPaused: boolean;
  loopN: number;
  tier: FullTier;
  name: PhaseName;
}

function tierFor(n: number): FullTier {
  return {
    scrollMul: Math.min(1.08 ** n, 1.5),
    fireRateMul: 1 + 0.1 * n,
    shotSpeedMul: 1 + 0.1 * n,
    fuelDrainMul: 1.15 ** n,
    slotShrink: Math.min(n * 2, 6),
    planesActive: n >= 1,
  };
}

const WAVE_YS = [2100, 2250, 2400, 2550] as const; // 3+3+2+2 = 10 fighters
const WAVE_SIZES = [3, 3, 2, 2] as const;

export function createPhases(): Phases {
  let bossRefs: BossRefs | null = null;
  let waveIdx = 0;
  let bonusPaid: PhaseName | null = null;

  const phases: Phases = {
    hasFloor: true,
    fuelFrozen: false,
    scrollPaused: false,
    loopN: 0,
    tier: tierFor(0),
    name: 'fortress1',

    update(game: Game, dt: number): void {
      const localY = game.cameraY - phases.loopN * PHASE3_END;
      const prev = phases.name;
      phases.name =
        localY < PHASE1_END
          ? 'fortress1'
          : localY < PHASE2_END
            ? 'space'
            : localY < BOSS_Y - 30 // stop close enough that the boss sits inside the visible window
              ? 'fortress2'
              : 'boss';

      phases.hasFloor = phases.name !== 'space';
      phases.fuelFrozen = phases.name === 'boss';

      // end-of-phase fuel bonus (fuel × 10), once per transition
      if (prev !== phases.name && bonusPaid !== phases.name) {
        game.score += Math.round(game.ship.fuel * 10);
        bonusPaid = phases.name;
      }

      // phase 2: fighter waves at fixed local trigger ys
      while (waveIdx < WAVE_YS.length && localY >= (WAVE_YS[waveIdx] ?? Infinity)) {
        const n = WAVE_SIZES[waveIdx] ?? 2;
        for (let i = 0; i < n; i++) {
          const f = game.spawner.spawn(
            'fighter',
            20 + i * 30,
            game.cameraY + 80 + i * 8,
            30 + i * 10,
          );
          if (f) f.fireTimer = 1 + i * 0.5;
        }
        waveIdx++;
      }

      // phase 3 → boss
      if (phases.name === 'boss') {
        if (!bossRefs) {
          bossRefs = spawnBoss(game.spawner, phases.loopN * PHASE3_END + BOSS_Y);
          phases.scrollPaused = true;
        }
        if (bossRefs) {
          const result = updateBoss(bossRefs, game.ship, game.pools, game.spawner, dt);
          if (result !== 'fighting') {
            // loop to tier n+1 (kill is optional glory — both outcomes loop)
            phases.loopN += 1;
            phases.tier = tierFor(phases.loopN);
            phases.scrollPaused = false;
            phases.name = 'fortress1';
            bossRefs = null;
            waveIdx = 0;
            bonusPaid = null;
            game.spawner.reset();
            game.rebaseForLoop(phases.loopN * PHASE3_END); // see step 4
          }
        }
      }
    },
  };
  return phases;
}
