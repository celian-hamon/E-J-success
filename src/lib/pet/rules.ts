// Tamagotchi rules, shared by server and client.
//
// • Each day, every course that meets that day (and has a published quiz) owes the pet one meal.
// • A meal is earned by finishing any quiz of that course on that day.
// • Hand-feeding an earned meal gives an immediate boost. Earned meals left uneaten are
//   eaten automatically overnight, so what counts is the learning, not the clicking.
// • Each meal missed on a class day costs fullness and happiness. Days with no class are
//   rest days. The pet never dies; it gets weak and recovers once it's fed again.

export const PET_RULES = {
  feedFullness: 30,
  feedHappiness: 10,
  missedFullness: 25,
  missedHappiness: 15,
  allFedBonus: 10, // happiness when every class meal of a day was earned
  restDayHappiness: 5,
  cuddleHappiness: 5,
  maxCatchUpDays: 30,
} as const;

export const PET_COLORS = {
  teal: ["#7ff5df", "#2de2c4"],
  violet: ["#cbbcff", "#7b5cff"],
  rose: ["#ffc0da", "#ff6fa8"],
  sun: ["#ffe9a8", "#ffb84d"],
  sky: ["#b8dcff", "#4a9dff"],
} as const;
export type PetColor = keyof typeof PET_COLORS;
export const PET_COLOR_KEYS = Object.keys(PET_COLORS) as PetColor[];
export function isPetColor(v: unknown): v is PetColor {
  return typeof v === "string" && v in PET_COLORS;
}

// Growth stages by total meals eaten.
export const STAGES = [
  { key: "egg", from: 0 },
  { key: "baby", from: 1 },
  { key: "child", from: 5 },
  { key: "teen", from: 15 },
  { key: "adult", from: 35 },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export function stageFor(meals: number) {
  const i = [...STAGES].reverse().findIndex((s) => meals >= s.from);
  const idx = STAGES.length - 1 - i;
  const next = STAGES[idx + 1];
  return { key: STAGES[idx].key, index: idx, nextAt: next?.from ?? null };
}

export type Mood = "happy" | "ok" | "hungry" | "weak";
export function moodFor(fullness: number, happiness: number): Mood {
  const score = Math.min(fullness, (fullness + happiness) / 2);
  if (score >= 70) return "happy";
  if (score >= 40) return "ok";
  if (score >= 15) return "hungry";
  return "weak";
}

export const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
