import "server-only";
import { db } from "./db";
import { isEnrolled } from "./auth";
import { blitzSeconds, comboMultiplier, playConfig, scoreAnswer } from "./game-modes";
import { awardAttempt } from "./gamification/engine";

// Answers are always graded on the server, both live (server actions) and when an
// offline run is synced later (/api/sync/attempts).

export async function playableQuiz(userId: string, quizId: string) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, courseId: true, published: true, mode: true, secondsPerQuestion: true, _count: { select: { questions: true } } },
  });
  if (!quiz || !quiz.published || !(await isEnrolled(userId, quiz.courseId))) return null;
  return quiz;
}

type AttemptForGrading = {
  id: string;
  quizId: string;
  startedAt: Date;
  totalQuestions: number;
  quiz: { mode: string; secondsPerQuestion: number; combo: boolean; lives: number | null };
};

/** Quiz fields gradeAnswer needs; use as `include: { quiz: { select: GRADING_QUIZ_FIELDS } }`. */
export const GRADING_QUIZ_FIELDS = { mode: true, secondsPerQuestion: true, combo: true, lives: true } as const;

export type GradeResult = {
  correct: boolean;
  correctChoiceId: string | null;
  points: number;
  explanation: string | null;
  wrongFeedback?: string | null; // only sent back after a wrong answer
  multiplier?: number; // combo: multiplier applied to this answer
  livesLeft?: number; // survival: lives remaining after this answer
  gameOver?: boolean; // no more answers will be accepted
};

/**
 * Grades and stores one answer. Returns null when the answer can't be accepted: unknown
 * question, already answered, no lives left (survival) or clock over (blitz, live only).
 */
export async function gradeAnswer(
  attempt: AttemptForGrading,
  questionId: string,
  choiceId: string | null,
  rawTimeMs: number,
  opts: { claim?: boolean | null; enforceClock?: boolean } = {},
): Promise<GradeResult | null> {
  const cfg = playConfig(attempt.quiz);

  const question = await db.question.findFirst({
    where: { id: questionId, quizId: attempt.quizId },
    include: { choices: true },
  });
  if (!question) return null;

  const previous = await db.attemptAnswer.findMany({
    where: { attemptId: attempt.id },
    orderBy: { createdAt: "asc" },
    select: { questionId: true, isCorrect: true },
  });
  if (previous.some((p) => p.questionId === questionId)) return null;

  const wrongSoFar = previous.filter((p) => !p.isCorrect).length;
  if (cfg.lives && wrongSoFar >= cfg.lives) return null;

  const globalLimitMs = blitzSeconds(attempt.totalQuestions, attempt.quiz.secondsPerQuestion) * 1000;
  if (cfg.timer === "global" && opts.enforceClock) {
    const grace = 5000; // network latency
    if (Date.now() - attempt.startedAt.getTime() > globalLimitMs + grace) return null;
  }

  let streakBefore = 0;
  for (let i = previous.length - 1; i >= 0 && previous[i].isCorrect; i--) streakBefore++;

  const correctChoice = question.choices.find((c) => c.isCorrect) ?? null;
  const picked = choiceId ? question.choices.find((c) => c.id === choiceId) ?? null : null;
  // True-or-false: `picked` is the proposed answer and `claim` is the student's verdict.
  const claim = cfg.trueFalse ? (opts.claim ?? null) : null;
  const correct = cfg.trueFalse ? picked !== null && claim !== null && picked.isCorrect === claim : Boolean(picked?.isCorrect);

  const limitMs = cfg.timer === "global" ? globalLimitMs : attempt.quiz.secondsPerQuestion * 1000;
  const timeMs = Math.min(limitMs, Math.max(0, Math.round(rawTimeMs)));
  const points = scoreAnswer(cfg, correct, timeMs, limitMs, streakBefore);

  await db.attemptAnswer.create({
    data: { attemptId: attempt.id, questionId: question.id, choiceId: picked?.id ?? null, claim, isCorrect: correct, points, timeMs },
  });

  const livesLeft = cfg.lives ? cfg.lives - wrongSoFar - (correct ? 0 : 1) : undefined;
  return {
    correct,
    correctChoiceId: correctChoice?.id ?? null,
    points,
    explanation: question.explanation,
    wrongFeedback: correct ? null : question.wrongFeedback,
    multiplier: cfg.combo && correct ? comboMultiplier(streakBefore) : undefined,
    livesLeft,
    gameOver: livesLeft !== undefined && livesLeft <= 0,
  };
}

/** Totals the answers, marks the attempt complete and awards XP. Safe to call twice. */
export async function completeAttempt(attemptId: string, playedAt?: Date) {
  const answers = await db.attemptAnswer.findMany({ where: { attemptId } });
  // Claim the attempt atomically so a double submit can't award XP twice.
  const claimed = await db.attempt.updateMany({
    where: { id: attemptId, completedAt: null },
    data: {
      completedAt: new Date(),
      score: answers.reduce((s, a) => s + a.points, 0),
      correctCount: answers.filter((a) => a.isCorrect).length,
    },
  });
  if (claimed.count === 1) await awardAttempt(attemptId, playedAt);
}
