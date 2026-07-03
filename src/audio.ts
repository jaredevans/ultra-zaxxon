import { settings } from './settings';

export type SfxName =
  | 'laser'
  | 'enemyShot'
  | 'explosion'
  | 'fuelPickup'
  | 'klaxon'
  | 'bossHit'
  | 'extraLife'
  | 'wallHit';

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let klaxonTimer: number | null = null;

interface Recipe {
  dur: number;
  gen: (t: number, dur: number) => number; // sample at time t, range [-1, 1]
}

const noise = (): number => Math.random() * 2 - 1;
const env = (t: number, dur: number): number => Math.max(0, 1 - t / dur);

const RECIPES: Record<SfxName, Recipe> = {
  laser: { dur: 0.12, gen: (t, d) => Math.sin(2 * Math.PI * (900 - 3000 * t) * t) * env(t, d) },
  enemyShot: {
    dur: 0.15,
    gen: (t, d) => Math.sin(2 * Math.PI * (300 + 800 * t) * t) * env(t, d) * 0.7,
  },
  explosion: { dur: 0.5, gen: (t, d) => noise() * env(t, d) ** 2 },
  fuelPickup: {
    dur: 0.2,
    gen: (t, d) =>
      Math.sin(2 * Math.PI * (440 + (660 * Math.floor(t * 20)) / 2) * t) * env(t, d) * 0.6,
  },
  klaxon: {
    dur: 0.3,
    gen: (t, d) => Math.sign(Math.sin(2 * Math.PI * 220 * t)) * env(t, d) * 0.4,
  },
  bossHit: {
    dur: 0.25,
    gen: (t, d) => (Math.sin(2 * Math.PI * 150 * t) + noise() * 0.5) * env(t, d) * 0.8,
  },
  extraLife: {
    dur: 0.6,
    gen: (t, d) =>
      Math.sin(2 * Math.PI * [523, 659, 784, 1047][Math.min(3, Math.floor(t * 8))]! * t) *
      env(t, d) *
      0.5,
  },
  wallHit: {
    dur: 0.09, // short metallic thunk
    gen: (t, d) => (noise() * 0.6 + Math.sin(2 * Math.PI * 480 * t) * 0.4) * env(t, d) ** 2 * 0.6,
  },
};

export function initAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  const rate = ctx.sampleRate;
  for (const [name, r] of Object.entries(RECIPES) as [SfxName, Recipe][]) {
    const buf = ctx.createBuffer(1, Math.ceil(r.dur * rate), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = r.gen(i / rate, r.dur);
    buffers.set(name, buf);
  }
}

export function play(name: SfxName): void {
  if (!ctx || settings.muted || ctx.state !== 'running') return;
  const buf = buffers.get(name);
  if (!buf) return;
  const src = ctx.createBufferSource(); // BufferSources are one-shot by design; cheap
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}

export function startKlaxonLoop(on: boolean): void {
  if (on && klaxonTimer === null) {
    klaxonTimer = window.setInterval(() => play('klaxon'), 800);
  } else if (!on && klaxonTimer !== null) {
    clearInterval(klaxonTimer);
    klaxonTimer = null;
  }
}
