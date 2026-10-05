import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { isEnrolled, requireRole } from "@/lib/auth";
import { blitzSeconds, isGameMode, playConfig } from "@/lib/game-modes";
import { shuffle } from "@/lib/difficulty";
import { mediaUrl } from "@/lib/media";
import PageHead from "@/components/PageHead";
import { parseData, questionType } from "@/lib/question-types";
import QuizPlayer, { type PlayerQuestion, type PlayerQuiz } from "./QuizPlayer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quiz = await db.quiz.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: quiz?.title };
}

export default async function PlayQuizPage({ params }: Props) {
  const user = await requireRole("STUDENT");
  const { id } = await params;
  const tn = await getTranslations("nav");

  const quiz = await db.quiz.findUnique({
    where: { id },
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
  if (!quiz || !quiz.published || !(await isEnrolled(user.id, quiz.courseId))) notFound();

  const mode = isGameMode(quiz.mode) ? quiz.mode : "classic";
  const cfg = playConfig(quiz);

  const playerQuiz: PlayerQuiz = {
    id: quiz.id,
    userId: user.id,
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
      // Answers never leave the server: no isCorrect, no positions, no categories, no zones, no value.
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

  return (
    <>
      <PageHead title={quiz.title} crumbs={[{ href: "/student", label: `${tn("myCourses")} · ${quiz.course.code}` }]} />
      <QuizPlayer quiz={playerQuiz} />
    </>
  );
}
