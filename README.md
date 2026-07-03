# Zaxxon Clone

A browser-based isometric scrolling shooter inspired by the arcade classic Zaxxon. Built with TypeScript and Vite — no runtime dependencies.

## Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a browser. The game boots immediately.

## Controls

| Key        | Action                                           |
| ---------- | ------------------------------------------------ |
| Arrow Keys | Left/Right strafe · Up = dive, Down = climb      |
| Space      | Fire laser (hold for autofire, max 4 shots live) |
| P          | Pause / Resume                                   |
| I          | Invert Y (make Up = climb); persisted            |
| M          | Toggle sound on/off; persisted                   |
| Enter      | Start game / Confirm high-score entry            |
| S          | _Dev builds only:_ skip ahead to the boss fight  |

## How to Play

**Altitude is the game.** The gap between your ship and its shadow is your height; the altimeter on the right shows it as a number, with ticks marking the height of every wall currently in play.

- **Walls:** climb above the stripes or thread the slots — touching them is death.
- **Ground targets** (fuel drums, turrets, radars, launchers): dive low (altimeter ≲ 10) and strafe them. They're solid — destroy them or fly over, not through.
- **Fuel:** you drain constantly; shooting a drum restores 20. At zero you sink to the floor.
- **Fighters** (open-space phase): they converge to your altitude — hold steady and they fly into your fire.
- **Boss:** match the extra altimeter tick that appears during the fight, line up with the glowing core on its front, and land 6 hits before it finishes 5 missile volleys.

You get 3 ships; a bonus ship arrives at 10,000 points. Surviving the boss (or killing it, +6000) loops the level at a faster, meaner tier.

## Features

- Three phases per loop: Fortress 1 → Space → Fortress 2 → Boss fight
- Fuel system with HUD altimeter and forced-descent on empty
- Enemy types: turrets, radar dishes, missile launchers, parked planes, fighters, boss
- 10-entry high-score table persisted via `localStorage`
- Synthesized Web Audio SFX (laser, explosion, fuel pickup, klaxon, boss)
- Difficulty scaling: each tier loop increases scroll speed, fire rate, fuel drain, and narrows wall slots

## Build & Deploy

```bash
npm run build
```

Outputs a static bundle to `dist/`. Deploy the contents of `dist/` to any static host (Netlify, GitHub Pages, S3, etc.). The S skip-key is compiled out of production builds.
