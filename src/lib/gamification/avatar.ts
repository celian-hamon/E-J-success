import type { BadgeId } from "./badges";

// Identity options (skin tone, hair style and natural hair colours) are always free.
// Only cosmetic extras unlock through levels and badges.
// Part and option names are translated under "avatar" in messages/*.json.
export type Unlock = { level?: number; badge?: BadgeId };
export type AvatarOption = { id: string; unlock?: Unlock; color?: string; color2?: string };

export const AVATAR_PARTS = {
  bg: [
    { id: "aurora", color: "#2de2c4", color2: "#7b5cff" },
    { id: "ocean", color: "#3a8dff", color2: "#1b2a6b" },
    { id: "mint", color: "#9ff5e5", color2: "#2aa58f" },
    { id: "sunset", color: "#ffb36f", color2: "#ff6fa8", unlock: { level: 2 } },
    { id: "ember", color: "#ff7a59", color2: "#7a1d3a", unlock: { level: 4 } },
    { id: "galaxy", color: "#a896ff", color2: "#0d1336", unlock: { level: 7 } },
    { id: "gold", color: "#ffe29a", color2: "#c98b12", unlock: { badge: "mastery-5" } },
  ],
  skin: [
    { id: "s1", color: "#ffe0c7" },
    { id: "s2", color: "#f5c9a0" },
    { id: "s3", color: "#e0a878" },
    { id: "s4", color: "#bf8457" },
    { id: "s5", color: "#8e5a3a" },
    { id: "s6", color: "#5e3a24" },
  ],
  hair: [
    { id: "short" },
    { id: "long" },
    { id: "curly" },
    { id: "bun" },
    { id: "afro" },
    { id: "buzz" },
    { id: "none" },
    { id: "mohawk", unlock: { level: 3 } },
    { id: "spiky", unlock: { level: 5 } },
  ],
  hairColor: [
    { id: "black", color: "#1d1a24" },
    { id: "brown", color: "#5a3825" },
    { id: "blonde", color: "#e8c46a" },
    { id: "auburn", color: "#9a3f22" },
    { id: "grey", color: "#b9bccb" },
    { id: "teal", color: "#2de2c4", unlock: { level: 2 } },
    { id: "violet", color: "#8f7bff", unlock: { level: 4 } },
    { id: "pink", color: "#ff6fa8", unlock: { level: 6 } },
  ],
  eyes: [
    { id: "open" },
    { id: "happy" },
    { id: "sleepy" },
    { id: "wink", unlock: { level: 3 } },
    { id: "stars", unlock: { badge: "perfect" } },
  ],
  mouth: [
    { id: "smile" },
    { id: "grin" },
    { id: "neutral" },
    { id: "open", unlock: { level: 2 } },
    { id: "tongue", unlock: { level: 5 } },
  ],
  accessory: [
    { id: "none" },
    { id: "glasses", unlock: { level: 2 } },
    { id: "headphones", unlock: { level: 4 } },
    { id: "cap", unlock: { level: 6 } },
    { id: "crown", unlock: { level: 10 } },
    { id: "wizard", unlock: { level: 15 } },
    { id: "graduate", unlock: { badge: "scholar-25" } },
    { id: "halo", unlock: { badge: "streak-30" } },
    { id: "flame", unlock: { badge: "streak-7" } },
  ],
} satisfies Record<string, AvatarOption[]>;

export type AvatarPart = keyof typeof AVATAR_PARTS;
export const AVATAR_PART_KEYS = Object.keys(AVATAR_PARTS) as AvatarPart[];
export type AvatarConfig = Record<AvatarPart, string>;

export function partOptions(part: AvatarPart): AvatarOption[] {
  return AVATAR_PARTS[part];
}

export const DEFAULT_AVATAR: AvatarConfig = {
  bg: "aurora",
  skin: "s2",
  hair: "short",
  hairColor: "brown",
  eyes: "open",
  mouth: "smile",
  accessory: "none",
};

export type UnlockContext = { level: number; badges: ReadonlySet<string>; everything?: boolean };

export function isUnlocked(opt: AvatarOption, ctx: UnlockContext) {
  if (ctx.everything || !opt.unlock) return true;
  if (opt.unlock.level && ctx.level < opt.unlock.level) return false;
  if (opt.unlock.badge && !ctx.badges.has(opt.unlock.badge)) return false;
  return true;
}

export function findOption(part: AvatarPart, id: string): AvatarOption | undefined {
  return partOptions(part).find((o) => o.id === id);
}

/** Parses a stored or submitted avatar. Unknown or locked parts fall back to the default. */
export function parseAvatar(raw: string | null | undefined, ctx?: UnlockContext): AvatarConfig {
  let input: Record<string, unknown> = {};
  try {
    if (raw) input = JSON.parse(raw);
  } catch {
    /* fall back to default */
  }
  const out = { ...DEFAULT_AVATAR };
  for (const part of AVATAR_PART_KEYS) {
    const value = input[part];
    const opt = typeof value === "string" ? findOption(part, value) : undefined;
    if (opt && (!ctx || isUnlocked(opt, ctx))) out[part] = opt.id;
  }
  return out;
}

/** Options that are unlocked under `after` but weren't under `before`. */
export function newlyUnlocked(before: UnlockContext, after: UnlockContext) {
  const result: { part: AvatarPart; id: string }[] = [];
  for (const part of AVATAR_PART_KEYS) {
    for (const option of partOptions(part)) {
      if (option.unlock && !isUnlocked(option, before) && isUnlocked(option, after)) result.push({ part, id: option.id });
    }
  }
  return result;
}
