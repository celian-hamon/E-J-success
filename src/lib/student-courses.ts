import "server-only";
import { db } from "./db";
import { starsFor } from "./gamification/stars";
import { daysUntilNext } from "./schedule";

// What the student pages show about each subject (course): its quizzes with the student's
// best result, progress, when it next meets, and which quiz to play next.

export async function loadStudentCourses(userId: string, courseId?: string) {
  const enrollments = await db.enrollment.findMany({
    where: { userId, ...(courseId ? { courseId } : {}) },
    orderBy: { course: { code: "asc" } },
    include: {
      course: {
        include: {
          teacher: { select: { name: true } },
          quizzes: {
            where: { published: true },
            orderBy: { createdAt: "desc" },
            include: {
              _count: { select: { questions: true } },
              attempts: {
                where: { userId, completedAt: { not: null } },
                orderBy: { correctCount: "desc" },
                take: 1,
                select: { score: true, correctCount: true, totalQuestions: true },
              },
            },
          },
        },
      },
    },
  });

  return enrollments.map(({ course }) => {
    const quizzes = course.quizzes.map((q) => {
      const best = q.attempts[0] ?? null;
      return { ...q, best, stars: best ? starsFor(best.correctCount, best.totalQuestions) : 0 };
    });
    // Next quiz: a new one first, else the one with the fewest stars (not yet mastered).
    const next =
      quizzes.find((q) => !q.best) ??
      [...quizzes].filter((q) => q.stars < 3).sort((a, b) => a.stars - b.stars)[0] ??
      null;
    return {
      ...course,
      quizzes,
      mastered: quizzes.filter((q) => q.stars === 3).length,
      played: quizzes.filter((q) => q.best).length,
      inDays: daysUntilNext(course.classDays),
      next,
    };
  });
}

export type StudentCourse = Awaited<ReturnType<typeof loadStudentCourses>>[number];

/** The course that meets soonest (today first); null if none has class days. */
export function nextClass(courses: StudentCourse[]) {
  return (
    courses
      .filter((c) => c.inDays !== null)
      .sort((a, b) => a.inDays! - b.inDays! || a.code.localeCompare(b.code))[0] ?? null
  );
}

/** A stable accent per subject, so each one keeps its colour everywhere. */
const ACCENTS = ["var(--teal)", "var(--violet)", "var(--rose)", "var(--lilac)", "#ffd166", "#5ec8ff"];
export function subjectAccent(code: string) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}
