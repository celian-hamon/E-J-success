// Badges reward learning behaviours (mastery, improvement, consistency),
// not raw grinding. Names and descriptions live under "badges" in messages/*.json;
// the checks live in engine.ts.
export const BADGES = {
  "first-quiz": { glyph: "✦", color: "#2de2c4" },
  perfect: { glyph: "★", color: "#ffd166" },
  comeback: { glyph: "↻", color: "#7b9cff" },
  speedster: { glyph: "⚡", color: "#ff6fa8" },
  "streak-3": { glyph: "③", color: "#ffa36f" },
  "streak-7": { glyph: "♨", color: "#ff7a59" },
  "streak-30": { glyph: "∞", color: "#ffd166" },
  "mastery-5": { glyph: "♛", color: "#a896ff" },
  explorer: { glyph: "✧", color: "#2de2c4" },
  "scholar-25": { glyph: "✎", color: "#7b9cff" },
  "level-5": { glyph: "✪", color: "#a896ff" },
  "level-10": { glyph: "☀", color: "#ffd166" },
} as const;

export type BadgeId = keyof typeof BADGES;
export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];

export function isBadgeId(value: string): value is BadgeId {
  return value in BADGES;
}
