import "server-only";
import { db } from "@/lib/db";
import { levelInfo } from "./levels";

export type LeaderRow = {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  level: number;
  xp: number; // XP earned in this course this week
  isViewer: boolean;
  className?: string | null; // school-wide board: the student's class
};

/** Monday 00:00 of the current week (server local time). Weekly boards give everyone a fresh start. */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * This week's XP ranking for one course. Students who opted out are hidden from others
 * (but still see their own rank). Returns the full ranking; use `leaderWindow` to trim it.
 */
export async function courseLeaderboard(courseId: string, viewerId?: string): Promise<LeaderRow[]> {
  const sums = await db.xpEvent.groupBy({
    by: ["userId"],
    where: { courseId, createdAt: { gte: weekStart() }, user: { role: "STUDENT", enrollments: { some: { courseId } } } },
    _sum: { amount: true },
  });
  const users = await db.user.findMany({
    where: { id: { in: sums.map((s) => s.userId) } },
    select: { id: true, name: true, avatar: true, xp: true, showOnLeaderboard: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return sums
    .map((s) => ({ user: byId.get(s.userId)!, xp: s._sum.amount ?? 0 }))
    .filter((r) => r.user && r.xp > 0 && (r.user.showOnLeaderboard || r.user.id === viewerId))
    .sort((a, b) => b.xp - a.xp || a.user.name.localeCompare(b.user.name))
    .map((r, i) => ({
      rank: i + 1,
      userId: r.user.id,
      name: r.user.name,
      avatar: r.user.avatar,
      level: levelInfo(r.user.xp).level,
      xp: r.xp,
      isViewer: r.user.id === viewerId,
    }));
}

export const PERIODS = ["week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

function periodStart(period: Period) {
  if (period === "week") return weekStart();
  if (period === "month") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  return null;
}

/** XP per student for the period (all-time uses the stored total). */
async function xpByStudent(period: Period) {
  const students = await db.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true, name: true, avatar: true, xp: true, showOnLeaderboard: true, classId: true, schoolClass: { select: { name: true } } },
  });
  const since = periodStart(period);
  const xp = new Map<string, number>();
  if (since) {
    const sums = await db.xpEvent.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since }, user: { role: "STUDENT" } },
      _sum: { amount: true },
    });
    sums.forEach((s) => xp.set(s.userId, s._sum.amount ?? 0));
  } else {
    students.forEach((s) => xp.set(s.id, s.xp));
  }
  return { students, xp };
}

export type SchoolRow = LeaderRow;

/** Every student in the school, across classes and courses. Opted-out students are hidden from others. */
export async function schoolLeaderboard(period: Period, viewerId?: string): Promise<SchoolRow[]> {
  const { students, xp } = await xpByStudent(period);
  return students
    .map((s) => ({ s, points: xp.get(s.id) ?? 0 }))
    .filter(({ s, points }) => points > 0 && (s.showOnLeaderboard || s.id === viewerId))
    .sort((a, b) => b.points - a.points || a.s.name.localeCompare(b.s.name))
    .map(({ s, points }, i) => ({
      rank: i + 1,
      userId: s.id,
      name: s.name,
      avatar: s.avatar,
      level: levelInfo(s.xp).level,
      xp: points,
      isViewer: s.id === viewerId,
      className: s.schoolClass?.name ?? null,
    }));
}

export type ClassRow = { rank: number; id: string; name: string; level: string | null; students: number; total: number; average: number; isViewer: boolean };

/**
 * Classes ranked by average XP per student, so small and large classes compete fairly.
 * Every student counts towards their class total, including those hidden from the individual board.
 */
export async function classLeaderboard(period: Period, viewerClassId?: string | null): Promise<ClassRow[]> {
  const [{ students, xp }, classes] = await Promise.all([
    xpByStudent(period),
    db.schoolClass.findMany({ select: { id: true, name: true, level: true } }),
  ]);
  return classes
    .map((c) => {
      const members = students.filter((s) => s.classId === c.id);
      const total = members.reduce((sum, s) => sum + (xp.get(s.id) ?? 0), 0);
      return { ...c, students: members.length, total, average: members.length ? Math.round(total / members.length) : 0 };
    })
    .filter((c) => c.students > 0)
    .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name))
    .map((c, i) => ({ ...c, rank: i + 1, isViewer: c.id === viewerClassId }));
}

/** Top 3 plus the viewer and their neighbours, so everyone sees someone they can catch. */
export function leaderWindow<T extends LeaderRow>(rows: T[], top = 3): T[] {
  const me = rows.findIndex((r) => r.isViewer);
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(top, rows.length); i++) keep.add(i);
  if (me >= 0) for (let i = me - 1; i <= me + 1; i++) if (i >= 0 && i < rows.length) keep.add(i);
  return [...keep].sort((a, b) => a - b).map((i) => rows[i]);
}
