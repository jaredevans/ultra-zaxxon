const KEY = 'zaxxon.settings.v1';

export const settings = { invertY: false, muted: false };

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s: unknown = JSON.parse(raw);
    if (typeof s === 'object' && s !== null) {
      const o = s as Record<string, unknown>;
      if (typeof o.invertY === 'boolean') settings.invertY = o.invertY;
      if (typeof o.muted === 'boolean') settings.muted = o.muted;
    }
  } catch {
    /* Safari private mode etc. — defaults stand */
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function toggleInvertY(): void {
  settings.invertY = !settings.invertY;
  save();
}

export function toggleMuted(): void {
  settings.muted = !settings.muted;
  save();
}
