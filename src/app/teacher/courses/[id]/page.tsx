import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { canManageCourse, requireRole } from "@/lib/auth";
import { isGameMode } from "@/lib/game-modes";
import { isGeneratorConfigured } from "@/lib/quiz-generator";
import type { SearchParams } from "@/lib/flash";
import { courseLeaderboard } from "@/lib/gamification/leaderboard";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import { Leaderboard } from "@/components/Progress";
import UploadQuizForm from "./UploadQuizForm";
import ImportQuizForm from "./ImportQuizForm";
import { createBlankQuiz } from "../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await db.course.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: course?.title };
}

export default async function TeacherCoursePage({ params, searchParams }: Props) {
  const user = await requireRole("TEACHER", "ADMIN");
  const { id } = await params;
  if (!(await canManageCourse(user, id))) notFound();
  const [t, tn, tg] = await Promise.all([getTranslations("teacher"), getTranslations("nav"), getTranslations("gameModes")]);

  const course = await db.course.findUnique({
    where: { id },
    include: {
      quizzes: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true, attempts: { where: { completedAt: { not: null } } } } } },
      },
      _count: { select: { enrollments: true } },
      classLinks: { select: { class: { select: { name: true } } }, orderBy: { class: { name: "asc" } } },
    },
  });
  if (!course) notFound();
  const board = await courseLeaderboard(course.id);

  return (
    <>
      <PageHead
        title={course.title}
        subtitle={
          t("courseSubtitle", { code: course.code, count: course._count.enrollments }) +
          (course.classLinks.length ? ` · ${t("classes", { names: course.classLinks.map((l) => l.class.name).join(", ") })}` : "")
        }
        crumbs={[{ href: "/teacher", label: tn("myCourses") }]}
        actions={user.role === "ADMIN" && <Link className="btn" href={`/admin/courses/${course.id}`}>{t("manageStudents")}</Link>}
      />
      <Flash searchParams={searchParams} />

      <div className="grid-2">
        <section className="panel glass">
          <h2>{t("quizzes")}</h2>
          {course.quizzes.length === 0 ? (
            <div className="empty">{t("noQuizzes")}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("quiz")}</th>
                    <th>{t("mode")}</th>
                    <th>{t("status")}</th>
                    <th>{t("played")}</th>
                  </tr>
                </thead>
                <tbody>
                  {course.quizzes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/teacher/quizzes/${q.id}`}><strong>{q.title}</strong></Link>
                        {q._count.questions > 0 && (
                          <Link href={`/teacher/quizzes/${q.id}/play`} className="test-link" title={t("testHint")}>🧪 {t("test")}</Link>
                        )}
                        <div className="muted" style={{ fontSize: 13 }}>
                          {t("questionCount", { count: q._count.questions })}
                          {q.sourceFileName ? ` · ${t("fromFile", { file: q.sourceFileName })}` : ""}
                        </div>
                      </td>
                      <td>{isGameMode(q.mode) ? tg(`${q.mode}.label`) : q.mode}</td>
                      <td>
                        <span className={`badge ${q.published ? "badge-teal" : ""}`}>{q.published ? t("published") : t("draft")}</span>
                      </td>
                      <td>{q._count.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel glass">
            <h2>{t("fromPdf")}</h2>
            <UploadQuizForm courseId={course.id} aiEnabled={isGeneratorConfigured()} />
          </section>
          <section className="panel glass">
            <h2>{t("fromJson")}</h2>
            <ImportQuizForm courseId={course.id} />
          </section>
          <section className="panel glass">
            <h2>{t("leaderboard")}</h2>
            <Leaderboard rows={board.slice(0, 10)} emptyText={t("leaderboardEmpty")} />
          </section>
          <section className="panel glass">
            <h2>{t("fromScratch")}</h2>
            <form className="row" action={createBlankQuiz}>
              <input type="hidden" name="courseId" value={course.id} />
              <input className="input" name="title" placeholder={t("quizTitlePlaceholder")} required style={{ flex: 1, minWidth: 180 }} />
              <button className="btn" type="submit">{t("create")}</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
