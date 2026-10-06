import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, managedCoursesWhere } from "@/lib/auth";

// Pages the service worker should pre-cache for this user, so the app keeps working
// offline: their home, every quiz they can play, recent results, profile and pet.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ urls: [] });

  const urls = new Set<string>(["/profile", "/leaderboard"]);
  if (user.role === "STUDENT") {
    urls.add("/student");
    urls.add("/student/pet");
    const quizzes = await db.quiz.findMany({
      where: { published: true, course: { enrollments: { some: { userId: user.id } } } },
      select: { id: true, courseId: true },
    });
    quizzes.forEach((q) => urls.add(`/student/courses/${q.courseId}`));
    quizzes.forEach((q) => urls.add(`/student/quizzes/${q.id}`));
    const attempts = await db.attempt.findMany({
      where: { userId: user.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { id: true },
    });
    attempts.forEach((a) => urls.add(`/attempts/${a.id}`));
  } else {
    urls.add("/teacher");
    const courses = await db.course.findMany({
      where: user.role === "ADMIN" ? {} : managedCoursesWhere(user.id),
      select: { id: true, quizzes: { select: { id: true } } },
    });
    for (const c of courses) {
      urls.add(`/teacher/courses/${c.id}`);
      c.quizzes.forEach((q) => urls.add(`/teacher/quizzes/${q.id}`));
    }
    if (user.role === "ADMIN") ["/admin", "/admin/courses", "/admin/users"].forEach((u) => urls.add(u));
  }

  return NextResponse.json({ urls: [...urls].slice(0, 150) }, { headers: { "Cache-Control": "no-store" } });
}
