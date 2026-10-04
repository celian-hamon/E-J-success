import "server-only";
import { db } from "@/lib/db";
import { newlyUnlocked, type AvatarPart } from "./avatar";
import { BADGES, type BadgeId } from "./badges";
import { levelInfo } from "./levels";
import { starsFor } from "./stars";
import { advanceStreak, dayKey } from "./streak";
import { earnMeal } from "@/lib/pet/engine";
import { xpMultiplier } from "@/lib/difficulty";

// XP rewards. A quiz's XP comes mostly from the first run; replays only pay for
// improving your best, so students practise for mastery rather than farming.
export const XP = {
  complete: 20,
  perCorrect: 10,
  perfect: 30,
  practice: 5,
  dailyFirst: 15,
} as const;

export type RewardSummary = {
  mealEarned?: boolean; // finished a quiz on its class day: the pet can eat
  xpGained: number;
  // Translated on display under "rewards.lines.<key>"; `n` is the count where relevant.
  lines: { key: RewardLineKey; xp: number; n?: number }[];
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  stars: number;
  bestStarsBefore: number;
  streak: number;
  freezeUsed: boolean;
  freezeEarned: boolean;
  newBadges: BadgeId[];
  newUnlocks: { part: AvatarPart; id: string }[];
};

export const REWARD_LINE_KEYS = ["complete", "correct", "improved", "practice", "perfect", "difficulty", "daily"] as const;
export type RewardLineKey = (typeof REWARD_LINE_KEYS)[number];

/** Awards XP, streak and badges for a just-completed attempt. Call once per attempt. */
export async function awardAttempt(attemptId: string, playedAt?: Date): Promise<RewardSummary> {
  const attempt = await db.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      quiz: { select: { id: true, courseId: true, mode: true, difficulty: true } },
      user: { include: { badges: { select: { badgeId: true } } } },
    },
  });
  const { user, quiz } = attempt;
  const total = attempt.totalQuestions;
  const correct = attempt.correctCount;
  const isPerfect = total > 0 && correct === total;

  const previous = await db.attempt.findMany({
    where: { userId: user.id, quizId: quiz.id, completedAt: { not: null }, id: { not: attempt.id } },
    select: { correctCount: true, totalQuestions: true },
  });
  const prevBest = previous.reduce((m, a) => Math.max(m, a.correctCount), -1);
  const prevPerfect = previous.some((a) => a.totalQuestions > 0 && a.correctCount === a.totalQuestions);
  const bestStarsBefore = previous.reduce((m, a) => Math.max(m, starsFor(a.correctCount, a.totalQuestions)), 0);

  // ── XP ──
  const lines: RewardSummary["lines"] = [];
  if (prevBest < 0) {
    lines.push({ key: "complete", xp: XP.complete });
    if (correct > 0) lines.push({ key: "correct", n: correct, xp: correct * XP.perCorrect });
  } else if (correct > prevBest) {
    const gain = correct - prevBest;
    lines.push({ key: "improved", n: gain, xp: gain * XP.perCorrect });
  } else {
    lines.push({ key: "practice", xp: XP.practice });
  }
  if (isPerfect && !prevPerfect) lines.push({ key: "perfect", xp: XP.perfect });

  // Quizzes played offline count for the day they were played, not the day they synced.
  // Harder quizzes pay more: bonus on everything the quiz earned (not the daily bonus).
  const multiplier = xpMultiplier(quiz.difficulty);
  const quizXp = lines.reduce((s, l) => s + l.xp, 0);
  const bonus = Math.round(quizXp * (multiplier - 1));
  if (bonus > 0) lines.push({ key: "difficulty", n: multiplier, xp: bonus });

  const streak = advanceStreak(user, dayKey(playedAt ?? new Date()));
  if (streak.firstToday) lines.push({ key: "daily", xp: XP.dailyFirst });

  const xpGained = lines.reduce((s, l) => s + l.xp, 0);
  const xpBefore = user.xp;
  const xpAfter = xpBefore + xpGained;
  const levelBefore = levelInfo(xpBefore).level;
  const levelAfter = levelInfo(xpAfter).level;

  // ── badges ──
  const owned = new Set(user.badges.map((b) => b.badgeId));
  const earned: BadgeId[] = [];
  const grant = (id: BadgeId, condition: boolean) => {
    if (condition && !owned.has(id)) earned.push(id);
  };

  const [completedCount, coursesPlayed, bests] = await Promise.all([
    db.attempt.count({ where: { userId: user.id, completedAt: { not: null } } }),
    db.attempt.findMany({
      where: { userId: user.id, completedAt: { not: null } },
      select: { quiz: { select: { courseId: true } } },
      distinct: ["quizId"],
    }),
    db.attempt.groupBy({
      by: ["quizId"],
      where: { userId: user.id, completedAt: { not: null } },
      _max: { correctCount: true, totalQuestions: true },
    }),
  ]);
  const masteredQuizzes = bests.filter(
    (b) => (b._max.totalQuestions ?? 0) > 0 && b._max.correctCount === b._max.totalQuestions,
  ).length;

  grant("first-quiz", completedCount >= 1);
  grant("perfect", isPerfect);
  grant("comeback", prevBest >= 0 && correct > prevBest);
  grant("speedster", quiz.mode === "timed" && total > 0 && attempt.score >= total * 1000 * 0.85);
  grant("streak-3", streak.currentStreak >= 3);
  grant("streak-7", streak.currentStreak >= 7);
  grant("streak-30", streak.currentStreak >= 30);
  grant("mastery-5", masteredQuizzes >= 5);
  grant("explorer", new Set(coursesPlayed.map((a) => a.quiz.courseId)).size >= 2);
  grant("scholar-25", completedCount >= 25);
  grant("level-5", levelAfter >= 5);
  grant("level-10", levelAfter >= 10);

  const unlocks = newlyUnlocked(
    { level: levelBefore, badges: owned },
    { level: levelAfter, badges: new Set([...owned, ...earned]) },
  );

  const mealEarned = await earnMeal(user.id, quiz.courseId, attempt.id, playedAt ?? new Date());

  const summary: RewardSummary = {
    mealEarned,
    xpGained,
    lines,
    xpBefore,
    xpAfter,
    levelBefore,
    levelAfter,
    stars: starsFor(correct, total),
    bestStarsBefore,
    streak: streak.currentStreak,
    freezeUsed: streak.freezeUsed,
    freezeEarned: streak.freezeEarned,
    newBadges: earned,
    newUnlocks: unlocks,
  };

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        xp: { increment: xpGained },
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActiveDay: streak.lastActiveDay,
        streakFreezes: streak.streakFreezes,
      },
    }),
    db.xpEvent.create({
      data: { userId: user.id, courseId: quiz.courseId, attemptId: attempt.id, amount: xpGained, reason: "quiz" },
    }),
    ...earned.map((badgeId) => db.userBadge.create({ data: { userId: user.id, badgeId } })),
    db.attempt.update({ where: { id: attempt.id }, data: { xpEarned: xpGained, rewards: JSON.stringify(summary) } }),
  ]);

  return summary;
}

export function parseRewards(raw: string | null): RewardSummary | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as RewardSummary;
    r.newBadges = r.newBadges.filter((b) => b in BADGES);
    // Older summaries stored English labels instead of keys; skip lines we can't translate.
    r.lines = r.lines.filter((l) => (REWARD_LINE_KEYS as readonly string[]).includes(l.key));
    return r;
  } catch {
    return null;
  }
}
