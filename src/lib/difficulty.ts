// Quiz difficulty: harder quizzes pay more XP. Labels live under "difficulty" in messages/*.json.
export const DIFFICULTIES = {
  easy: { xpMultiplier: 1, badge: "badge-teal" },
  medium: { xpMultiplier: 1.5, badge: "badge-violet" },
  hard: { xpMultiplier: 2, badge: "badge-rose" },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES) as Difficulty[];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && v in DIFFICULTIES;
}

export function xpMultiplier(difficulty: string) {
  return isDifficulty(difficulty) ? DIFFICULTIES[difficulty].xpMultiplier : 1;
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
