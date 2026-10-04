import "server-only";
import { db } from "./db";
import { canManageCourse, type SessionUser } from "./auth";

/** The quiz if this user may edit it (admin, or the course's teacher), else null. */
export async function getManagedQuiz(user: SessionUser, quizId: string) {
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { id: true, courseId: true } });
  if (!quiz || !(await canManageCourse(user, quiz.courseId))) return null;
  return quiz;
}
