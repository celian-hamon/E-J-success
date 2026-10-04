import "server-only";
import { db } from "@/lib/db";
import type { UnlockContext } from "./avatar";
import { isBadgeId, type BadgeId } from "./badges";
import { levelInfo } from "./levels";
import { liveStreak } from "./streak";

/** Everything the UI needs to show a user's meta progression. */
export async function loadProgress(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { badges: { orderBy: { earnedAt: "asc" } }, schoolClass: { select: { name: true } } },
  });
  const badges = user.badges.map((b) => b.badgeId).filter(isBadgeId) as BadgeId[];
  const level = levelInfo(user.xp);
  const unlock: UnlockContext = {
    level: level.level,
    badges: new Set(badges),
    // Staff don't play quizzes, so every avatar item is open to them.
    everything: user.role !== "STUDENT",
  };
  return {
    user,
    level,
    badges,
    badgeDates: new Map(user.badges.map((b) => [b.badgeId, b.earnedAt])),
    unlock,
    streak: liveStreak(user),
  };
}
