import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { completeAttempt, gradeAnswer, GRADING_QUIZ_FIELDS, playableQuiz } from "@/lib/grading";

export const runtime = "nodejs";

// Receives a quiz run that was played (fully or partly) offline and grades it.
// Idempotent: the client's `clientId` is stored on the attempt, so retries return
// the same result instead of creating duplicates.
const Body = z.object({
  clientId: z.string().min(8).max(64),
  userId: z.string(), // who played it; must match the signed-in user
  quizId: z.string(),
  attemptId: z.string().nullable(), // set if the run started online before the connection dropped
  playedAt: z.string().datetime(),
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        choiceId: z.string().nullable(),
        timeMs: z.number().min(0),
        claim: z.boolean().nullable().optional(), // true-or-false mode
      }),
    )
    .max(200),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (user.role !== "STUDENT") return NextResponse.json({ error: "role" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { clientId, quizId, attemptId, answers } = parsed.data;
  // A shared device may hold runs from another student: never credit them to whoever is signed in now.
  if (parsed.data.userId !== user.id) return NextResponse.json({ error: "other-user" }, { status: 409 });
  // Don't trust a future date from the device clock.
  const playedAt = new Date(Math.min(Date.parse(parsed.data.playedAt), Date.now()));

  const done = await db.attempt.findUnique({ where: { clientId }, select: { id: true, userId: true, completedAt: true } });
  if (done && done.userId === user.id && done.completedAt) {
    return NextResponse.json({ attemptId: done.id, duplicate: true });
  }

  const quiz = await playableQuiz(user.id, quizId);
  // Gone, unpublished or no longer enrolled: nothing to grade, and retrying won't help.
  if (!quiz) return NextResponse.json({ error: "unavailable" }, { status: 410 });

  let attempt = attemptId
    ? await db.attempt.findFirst({
        where: { id: attemptId, userId: user.id, quizId },
        include: { quiz: { select: GRADING_QUIZ_FIELDS } },
      })
    : null;
  if (attempt?.completedAt) return NextResponse.json({ attemptId: attempt.id, duplicate: true });

  if (attempt) {
    await db.attempt.update({ where: { id: attempt.id }, data: { clientId } });
  } else {
    attempt = await db.attempt.create({
      data: { quizId, userId: user.id, totalQuestions: quiz._count.questions, clientId, startedAt: playedAt },
      include: { quiz: { select: GRADING_QUIZ_FIELDS } },
    });
  }

  // Same rules as live play (lives, combo order, true-or-false); the blitz clock can't be
  // checked after the fact, so the player enforces it offline.
  for (const a of answers) await gradeAnswer(attempt, a.questionId, a.choiceId, a.timeMs, { claim: a.claim });
  await completeAttempt(attempt.id, playedAt);

  const result = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { xpEarned: true, correctCount: true, totalQuestions: true } });
  return NextResponse.json({ attemptId: attempt.id, ...result });
}
