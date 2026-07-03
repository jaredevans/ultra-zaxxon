const keys = new Set<string>();
const pressed = new Set<string>(); // edge-triggered, consumed once

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyP',
  'KeyI',
  'KeyM',
  'Enter',
  'Backspace',
]);

export function initInput(): void {
  addEventListener('keydown', (e) => {
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });
}

export const isDown = (code: string): boolean => keys.has(code);

/** One-shot press (pause, menu toggles). Sampled in fixed update, never in handlers. */
export function consumePress(code: string): boolean {
  const hit = pressed.has(code);
  if (hit) pressed.delete(code);
  return hit;
}
