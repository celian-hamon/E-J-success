"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { completeAttempt, gradeAnswer, GRADING_QUIZ_FIELDS, playableQuiz, type GradeResult } from "@/lib/grading";

// The player only learns whether an answer was right after submitting it.
// Errors carry a short code; the player shows a translated message.

export async function startAttempt(quizId: string) {
  const user = await requireRole("STUDENT");
  const quiz = await playableQuiz(user.id, quizId);
  if (!quiz) throw new Error("unavailable");
  // Abandoned runs (closed tab, refresh) are discarded when a new one starts.
  await db.attempt.deleteMany({ where: { quizId, userId: user.id, completedAt: null } });
  const attempt = await db.attempt.create({
    data: { quizId, userId: user.id, totalQuestions: quiz._count.questions },
  });
  return { attemptId: attempt.id };
}

export type AnswerResult = GradeResult;

export async function submitAnswer(input: {
  attemptId: string;
  questionId: string;
  choiceId: string | null; // null = ran out of time
  timeMs: number;
  claim?: boolean | null; // true-or-false mode
}): Promise<AnswerResult> {
  const user = await requireRole("STUDENT");
  const attempt = await db.attempt.findUnique({
    where: { id: input.attemptId },
    include: { quiz: { select: GRADING_QUIZ_FIELDS } },
  });
  if (!attempt || attempt.userId !== user.id || attempt.completedAt) throw new Error("over");
  const result = await gradeAnswer(attempt, input.questionId, input.choiceId, input.timeMs, {
    claim: input.claim,
    enforceClock: true,
  });
  if (!result) throw new Error("over");
  return result;
}

export async function finishAttempt(attemptId: string) {
  const user = await requireRole("STUDENT");
  const attempt = await db.attempt.findUnique({ where: { id: attemptId }, select: { userId: true } });
  if (!attempt || attempt.userId !== user.id) throw new Error("unknown");
  await completeAttempt(attemptId);
  return { attemptId };
}
