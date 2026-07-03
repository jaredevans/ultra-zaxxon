const KEY = 'zaxxon.scores.v1';
export interface ScoreRow {
  name: string;
  score: number;
}

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r): r is ScoreRow =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as ScoreRow).name === 'string' &&
          typeof (r as ScoreRow).score === 'number',
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  const rows = loadScores();
  return score > 0 && (rows.length < 10 || score > (rows[9]?.score ?? 0));
}

export function insertScore(name: string, score: number): void {
  const rows = loadScores();
  rows.push({ name, score });
  rows.sort((a, b) => b.score - a.score);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 10)));
  } catch {
    /* ignore */
  }
}
