import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { isEnrolled, requireRole } from "@/lib/auth";
import { blitzSeconds, isGameMode, playConfig } from "@/lib/game-modes";
import { shuffle } from "@/lib/difficulty";
import { mediaUrl } from "@/lib/media";
import PageHead from "@/components/PageHead";
import QuizPlayer, { type PlayerQuiz } from "./QuizPlayer";

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
          prompt: true,
          imageId: true,
          choices: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true, imageId: true } },
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
    questions: (quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions).map((q) => {
      // isCorrect never leaves the server: only ids and texts are sent to the browser.
      const ordered = quiz.shuffleAnswers ? shuffle(q.choices) : q.choices;
      const choices = ordered.map(({ id, text, imageId }) => ({ id, text, image: mediaUrl(imageId) }));
      const image = mediaUrl(q.imageId);
      if (!cfg.trueFalse) return { id: q.id, prompt: q.prompt, image, choices };
      // True-or-false: propose the right answer half the time, otherwise a random wrong one.
      const right = q.choices.find((c) => c.isCorrect);
      const wrong = q.choices.filter((c) => !c.isCorrect);
      const shown = !right || (wrong.length && Math.random() < 0.5) ? wrong[Math.floor(Math.random() * wrong.length)] : right;
      return {
        id: q.id,
        prompt: q.prompt,
        image,
        choices,
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
