import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getManagedQuiz } from "@/lib/quiz-access";
import { loadPlayerQuiz } from "@/lib/player-quiz";
import PageHead from "@/components/PageHead";
import QuizPlayer from "@/app/student/quizzes/[id]/QuizPlayer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quiz = await db.quiz.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: quiz?.title };
}

/** Staff test mode: play any quiz you manage (drafts included) without recording anything. */
export default async function TestQuizPage({ params }: Props) {
  const user = await requireRole("TEACHER", "ADMIN");
  const { id } = await params;
  if (!(await getManagedQuiz(user, id))) notFound();
  const loaded = await loadPlayerQuiz(id, user.id);
  if (!loaded) notFound();
  const { quiz, playerQuiz } = loaded;
  const [tn, tp] = await Promise.all([getTranslations("nav"), getTranslations("player")]);

  return (
    <>
      <PageHead
        title={quiz.title}
        subtitle={quiz.published ? tp("mockSubtitle") : tp("mockSubtitleDraft")}
        crumbs={[
          { href: "/teacher", label: tn("myCourses") },
          { href: `/teacher/courses/${quiz.course.id}`, label: quiz.course.code },
          { href: `/teacher/quizzes/${quiz.id}`, label: quiz.title },
        ]}
      />
      <QuizPlayer quiz={playerQuiz} mock={{ exitHref: `/teacher/quizzes/${quiz.id}` }} />
    </>
  );
}
