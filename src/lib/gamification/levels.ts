// XP needed to go from `level` to `level + 1`. Early levels come fast (a quiz or two),
// later ones stretch out so there's always a next goal.
export function xpToNext(level: number) {
  return 100 + (level - 1) * 50;
}

// Tier names are translated under "tiers" in messages/*.json.
export const TIERS = [
  { from: 1, key: "rookie", color: "#9aa4d6" },
  { from: 3, key: "explorer", color: "#2de2c4" },
  { from: 5, key: "scholar", color: "#7b9cff" },
  { from: 8, key: "expert", color: "#a896ff" },
  { from: 12, key: "sage", color: "#ff6fa8" },
  { from: 16, key: "legend", color: "#ffd166" },
] as const;

export type TierKey = (typeof TIERS)[number]["key"];

export function tierFor(level: number) {
  return [...TIERS].reverse().find((t) => level >= t.from) ?? TIERS[0];
}

export type LevelInfo = {
  level: number;
  tier: TierKey;
  color: string;
  xp: number;
  intoLevel: number; // XP earned since reaching this level
  needed: number; // XP this level takes in total
  progress: number; // 0..1
};

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  const tier = tierFor(level);
  return { level, tier: tier.key, color: tier.color, xp, intoLevel: rest, needed, progress: rest / needed };
}
