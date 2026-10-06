import "server-only";
import { db } from "./db";
import { blitzSeconds, isGameMode, playConfig } from "./game-modes";
import { shuffle } from "./difficulty";
import { mediaUrl } from "./media";
import { parseData, questionType } from "./question-types";
import type { PlayerQuestion, PlayerQuiz } from "@/app/student/quizzes/[id]/QuizPlayer";

/**
 * Loads a quiz and prepares what the player receives, for a student game or a staff test.
 * Answers never leave the server: no isCorrect, no positions, no categories, no zones, no value.
 * Access checks are the caller's job.
 */
export async function loadPlayerQuiz(quizId: string, userId: string) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    include: {
      course: { select: { id: true, code: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          data: true,
          prompt: true,
          imageId: true,
          choices: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true, imageId: true, order: true } },
        },
      },
    },
  });
  if (!quiz) return null;

  const mode = isGameMode(quiz.mode) ? quiz.mode : "classic";
  const cfg = playConfig(quiz);

  const playerQuiz: PlayerQuiz = {
    id: quiz.id,
    userId,
    title: quiz.title,
    description: quiz.description,
    mode,
    config: cfg,
    secondsPerQuestion: quiz.secondsPerQuestion,
    globalSeconds: cfg.timer === "global" ? blitzSeconds(quiz.questions.length, quiz.secondsPerQuestion) : null,
    difficulty: quiz.difficulty,
    // Shuffling happens here, so every visit gets a new order. Grading uses ids, not positions.
    questions: (quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions).map((q): PlayerQuestion => {
      const type = questionType(q.type);
      const data = parseData(q.data);
      // Items to put in order are always mixed (and never shown already in order).
      let ordered = quiz.shuffleAnswers || type === "order" || type === "categorize" ? shuffle(q.choices) : q.choices;
      for (let i = 0; type === "order" && i < 5 && ordered.every((c, j) => j === 0 || c.order > ordered[j - 1].order); i++) {
        ordered = shuffle(q.choices);
      }
      const choices = ordered.map(({ id, text, imageId }) => ({ id, text, image: mediaUrl(imageId) }));
      const image = mediaUrl(q.imageId);
      const base = { id: q.id, type, prompt: q.prompt, image, choices };
      if (type === "categorize") return { ...base, categories: data.categories ?? [] };
      if (type === "numeric") return { ...base, unit: data.unit ?? null };
      if (type !== "choice" || !cfg.trueFalse) return base;
      // True-or-false: propose the right answer half the time, otherwise a random wrong one.
      const right = q.choices.find((c) => c.isCorrect);
      const wrong = q.choices.filter((c) => !c.isCorrect);
      const shown = !right || (wrong.length && Math.random() < 0.5) ? wrong[Math.floor(Math.random() * wrong.length)] : right;
      return {
        ...base,
        statement: shown ? { choiceId: shown.id, text: shown.text, image: mediaUrl(shown.imageId) } : undefined,
      };
    }),
  };
  return { quiz, playerQuiz };
}
