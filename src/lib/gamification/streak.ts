// Days are compared as local calendar dates ("YYYY-MM-DD") on the server.
export function dayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA");
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7; // a 7-day run earns one streak freeze

/**
 * The streak to display today. A streak stays alive through yesterday; a single missed
 * day is still covered while the student has a freeze (it's spent when they next play).
 */
export function liveStreak(u: { currentStreak: number; lastActiveDay: string | null; streakFreezes: number }, today = dayKey()) {
  if (!u.lastActiveDay) return { streak: 0, playedToday: false, atRisk: false };
  const gap = daysBetween(u.lastActiveDay, today);
  if (gap <= 0) return { streak: u.currentStreak, playedToday: true, atRisk: false };
  if (gap === 1) return { streak: u.currentStreak, playedToday: false, atRisk: true };
  if (gap === 2 && u.streakFreezes > 0) return { streak: u.currentStreak, playedToday: false, atRisk: true };
  return { streak: 0, playedToday: false, atRisk: false };
}

/** Streak state after completing a quiz today. */
export function advanceStreak(u: { currentStreak: number; longestStreak: number; lastActiveDay: string | null; streakFreezes: number }, today = dayKey()) {
  let { currentStreak, streakFreezes } = u;
  let freezeUsed = false;
  const gap = u.lastActiveDay ? daysBetween(u.lastActiveDay, today) : Infinity;

  if (gap <= 0) {
    return { ...u, firstToday: false, freezeUsed, freezeEarned: false };
  } else if (gap === 1) {
    currentStreak += 1;
  } else if (gap === 2 && streakFreezes > 0) {
    streakFreezes -= 1;
    freezeUsed = true;
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  const freezeEarned = currentStreak % FREEZE_EVERY === 0 && streakFreezes < MAX_FREEZES;
  if (freezeEarned) streakFreezes += 1;

  return {
    currentStreak,
    longestStreak: Math.max(u.longestStreak, currentStreak),
    lastActiveDay: today,
    streakFreezes,
    firstToday: true,
    freezeUsed,
    freezeEarned,
  };
}
