# Zaxxon Clone

A browser-based isometric scrolling shooter inspired by the arcade classic Zaxxon. Built with TypeScript and Vite — no runtime dependencies.

## Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a browser. The game boots immediately.

## Controls

| Key        | Action                                |
| ---------- | ------------------------------------- |
| Arrow Keys | Move ship (Left/Right/Up/Down)        |
| Space      | Fire laser                            |
| P          | Pause / Resume                        |
| I          | Toggle invert-Y (up = climb vs. dive) |
| M          | Toggle sound on/off                   |
| Enter      | Start game / Confirm high-score entry |

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

Outputs a static bundle to `dist/`. Deploy the contents of `dist/` to any static host (Netlify, GitHub Pages, S3, etc.).
