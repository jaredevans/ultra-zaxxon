// The player ship is not a sprite — the renderer draws it as a projected
// flat-shaded 3D model so its attack angle and roll read continuously.
export type SpriteName =
  | 'shadow'
  | 'hangar'
  | 'tower'
  | 'silo'
  | 'antenna'
  | 'bunker'
  | 'turret'
  | 'radar'
  | 'fuelDrum'
  | 'launcher'
  | 'missile'
  | 'fighter'
  | 'plane'
  | 'raider'
  | 'boss'
  | 'bossCore'
  | 'explosion';

export interface Atlas {
  draw(
    ctx: CanvasRenderingContext2D,
    name: SpriteName,
    frame: number,
    sx: number,
    sy: number,
    scale?: number, // integer-ish upscale, nearest-neighbor (smoothing is off)
  ): void;
  size(name: SpriteName): { w: number; h: number };
}

const PAL: Record<string, string> = {
  W: '#e8e8e8',
  G: '#8a8a9a',
  D: '#4a4a5a',
  B: '#3050e0',
  C: '#70c8ff',
  R: '#e03030',
  O: '#ff9020',
  Y: '#ffe040',
  K: '#101018',
  E: '#20a040',
  S: 'rgba(0,0,0,0.45)',
  M: '#6a7a8e', // base-structure metal
  N: '#3c4654', // dark metal
  L: '#aeb8c8', // lit metal
};

// prettier-ignore
const GRIDS: Record<string, string[][]> = {
  hangar: [[
    '......MMMMMMMMMM......',
    '....MMLLLLLLLLLLMM....',
    '..MMLLMMMMMMMMMMLLMM..',
    '.MLLMMNNNNNNNNNNMMLLM.',
    'MLLMNNNNNNNNNNNNNNMLLM',
    'MLMNNNKKKKKKKKNNNNNMLM',
    'MLMNNNKKKKKKKKNNNNNMLM',
    'MLMNNNKKKKKKKKNNNNNMLM',
    'MLMNNNKKKKKKKKNNNNNMLM',
    'NNNNNNKKKKKKKKNNNNNNNN',
    'YKYKYKYKYKYKYKYKYKYKYK',
  ]],
  tower: [[
    '.LLLLLLLL.',
    '.LKKLLKKL.',
    '.LLLLLLLL.',
    '.LKKLLKKL.',
    '.LLLLLLLL.',
    '..MMMMMM..',
    '...MMMM...',
    '...MMMM...',
    '...MMMM...',
    '...MMMM...',
    '...MMMM...',
    '..MMMMMM..',
    '.MMMMMMMM.',
    '.MNNNNNNM.',
    'MMNNNNNNMM',
    'KKKKKKKKKK',
  ]],
  silo: [[
    '...MMMMMM...',
    '.MMLLLLLLMM.',
    '.MLLWWLLLLM.',
    '.MLLWWLLLLM.',
    '.MLLLLLLLLM.',
    '.MNLLLLLLNM.',
    '.MNLLLLLLNM.',
    '.MNNLLLLNNM.',
    '.MNNNNNNNNM.',
    '.MMNNNNNNMM.',
    '..MMMMMMMM..',
    'KKKKKKKKKKKK',
  ]],
  antenna: [[
    '....CC....',
    '...CCCC...',
    '....CC....',
    '....MM....',
    '...MMMM...',
    '....MM....',
    '....MM....',
    '.C..MM....',
    '..C.MM....',
    '...CMM....',
    '....MM....',
    '....MM....',
    '....MM....',
    '...MMMM...',
    '..MMMMMM..',
    'KKKKKKKKKK',
  ]],
  bunker: [[
    '..MMMMMMMMMM..',
    '.MNNNNNNNNNNM.',
    'MNNKKKKKKKKNNM',
    'MNNKKKKKKKKNNM',
    'MNNNNNNNNNNNNM',
    'MNNNNNNNNNNNNM',
    'MMMMMMMMMMMMMM',
    'YKYKYKYKYKYKYK',
  ]],
  turret: [[
    '....RR....',
    '....RR....',
    '..GGGGGG..',
    '.GGGGGGGG.',
    '.GDDDDDDG.',
    'GGGGGGGGGG',
    'KKKKKKKKKK',
  ]],
  radar: [[
    'CC......CC',
    '.CC....CC.',
    '..CCCCCC..',
    '...CCCC...',
    '....GG....',
    '....GG....',
    '..GGGGGG..',
    'KKKKKKKKKK',
  ]],
  fuelDrum: [[
    '...YYYYYY...',
    '..YWWWWWWY..',
    '.YWWWWWWWWY.',
    '.YYWWWWWWYY.',
    '.OYYYYYYYYO.',
    '.OYYYYYYWYO.',
    '.OYKKKKKWYO.',
    '.OYKKKKKWYO.',
    '.OYYYYYYWYO.',
    '.OYYYYYYWYO.',
    '.OOYYYYYYOO.',
    '..OOOOOOOO..',
    '.SSSSSSSSSS.',
  ]],
  launcher: [[
    '...RRRR...',
    '..RWWWWR..',
    '.GGGGGGGG.',
    'GGDDDDDDGG',
    'KKKKKKKKKK',
  ]],
  missile: [[
    '.RR.',
    'RWWR',
    'RWWR',
    'GGGG',
    'GGGG',
    '.OO.',
    'OYYO',
  ]],
  fighter: [[
    '......RR......',
    '.....RRRR.....',
    'R...RDDDDR...R',
    'RRRRRRRRRRRRRR',
    '.RRRRDDDDRRRR.',
    '....RR..RR....',
  ]],
  plane: [[
    '......GG......',
    '.....GGGG.....',
    'G...GDDDDG...G',
    'GGGGGGGGGGGGGG',
    '.GGGGDDDDGGGG.',
    '....GG..GG....',
  ]],
  raider: [[
    '......EE......',
    '.....EEEE.....',
    'E...EDCCDE...E',
    'EEEEEEEEEEEEEE',
    '.EEEEDDDDEEEE.',
    '....EE..EE....',
  ]],
  boss: [[
    '....DDDDDDDD....',
    '...DGGGGGGGGD...',
    '..DGRR....RRGD..',
    '..DG..GGGG..GD..',
    '.DGG.GDDDDG.GGD.',
    '.DG..GDCCDG..GD.',
    '.DG..GDCCDG..GD.',
    '.DGG.GDDDDG.GGD.',
    '..DG..GGGG..GD..',
    '..DGGGGGGGGGGD..',
    '.DDKKDDDDDDKKDD.',
    'DDKKKKDDDDKKKKDD',
  ]],
  bossCore: [[
    '..RRRR..',
    '.RYYYYR.',
    'RYYWWYYR',
    'RYWKKWYR',
    'RYWKKWYR',
    'RYYWWYYR',
    '.RYYYYR.',
    '..RRRR..',
  ]],
  explosion: [
    ['....', '.YY.', '.YY.', '....'],
    ['..OO..', '.OYYO.', 'OYWWYO', 'OYWWYO', '.OYYO.', '..OO..'],
    ['.O..O.O.', 'O.OOOO.O', '.OYYYYO.', 'OOYWWYOO', 'OOYWWYOO', '.OYYYYO.', 'O.OOOO.O', '.O..O.O.'],
    ['O..O..O.', '........', '..O..O..', 'O.......', '......O.', '..O.....', '........', '.O..O..O'],
  ],
};

const SCALE = 2;

export function initAtlas(): Atlas {
  const entries = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }[]>();

  const renderGrid = (rows: string[]): HTMLCanvasElement => {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const c = document.createElement('canvas');
    c.width = w * SCALE;
    c.height = h * SCALE;
    const g = c.getContext('2d');
    if (!g) throw new Error('atlas ctx');
    for (let ry = 0; ry < h; ry++) {
      const row = rows[ry] ?? '';
      for (let rx = 0; rx < w; rx++) {
        const color = PAL[row[rx] ?? '.'];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(rx * SCALE, ry * SCALE, SCALE, SCALE);
      }
    }
    return c;
  };

  for (const [name, frames] of Object.entries(GRIDS)) {
    entries.set(
      name,
      frames.map((rows) => {
        const canvas = renderGrid(rows);
        return { canvas, w: canvas.width, h: canvas.height };
      }),
    );
  }

  // shadow: soft ellipse, code-drawn (no grid)
  const sh = document.createElement('canvas');
  sh.width = 28;
  sh.height = 10;
  const sg = sh.getContext('2d');
  if (!sg) throw new Error('atlas ctx');
  sg.fillStyle = PAL.S ?? 'rgba(0,0,0,0.45)';
  sg.beginPath();
  sg.ellipse(14, 5, 13, 4, 0, 0, Math.PI * 2);
  sg.fill();
  entries.set('shadow', [{ canvas: sh, w: 28, h: 10 }]);

  return {
    draw(ctx, name, frame, sx, sy, scale = 1) {
      const frames = entries.get(name);
      if (!frames || frames.length === 0) return;
      const f = frames[Math.min(Math.max(0, frame), frames.length - 1)];
      if (!f) return;
      const w = f.w * scale;
      const h = f.h * scale;
      ctx.drawImage(f.canvas, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h);
    },
    size(name) {
      const f = entries.get(name)?.[0];
      return { w: f?.w ?? 0, h: f?.h ?? 0 };
    },
  };
}
