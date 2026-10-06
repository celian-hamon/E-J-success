import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { isEnrolled, requireRole } from "@/lib/auth";
import { loadPlayerQuiz } from "@/lib/player-quiz";
import PageHead from "@/components/PageHead";
import QuizPlayer from "./QuizPlayer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quiz = await db.quiz.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: quiz?.title };
}

export default async function PlayQuizPage({ params }: Props) {
  const user = await requireRole("STUDENT");
  const { id } = await params;
  const tn = await getTranslations("nav");

  const loaded = await loadPlayerQuiz(id, user.id);
  if (!loaded || !loaded.quiz.published || !(await isEnrolled(user.id, loaded.quiz.courseId))) notFound();
  const { quiz, playerQuiz } = loaded;

  return (
    <>
      <PageHead
        title={quiz.title}
        crumbs={[
          { href: "/student", label: tn("myCourses") },
          { href: `/student/courses/${quiz.course.id}`, label: quiz.course.code },
        ]}
      />
      <QuizPlayer quiz={playerQuiz} />
    </>
  );
}
