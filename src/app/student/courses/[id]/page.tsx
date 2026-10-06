import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isGameMode, MODE_BADGE } from "@/lib/game-modes";
import { DIFFICULTIES, isDifficulty } from "@/lib/difficulty";
import { courseLeaderboard, leaderWindow } from "@/lib/gamification/leaderboard";
import { isoWeekday, weekdayDate } from "@/lib/schedule";
import { loadStudentCourses, subjectAccent } from "@/lib/student-courses";
import PageHead from "@/components/PageHead";
import { ClassDaysLabel } from "@/components/WeekdayPicker";
import { Leaderboard, Stars } from "@/components/Progress";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await db.course.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: course?.title };
}

/** One subject: its quizzes (with the student's best result) and the week's leaderboard. */
export default async function SubjectPage({ params }: Props) {
  const user = await requireRole("STUDENT");
  const { id } = await params;
  const [course] = await loadStudentCourses(user.id, id);
  if (!course) notFound(); // not enrolled
  const [t, tn, tpl, td, tg, format, board] = await Promise.all([
    getTranslations("student"),
    getTranslations("nav"),
    getTranslations("player"),
    getTranslations("difficulty"),
    getTranslations("gameModes"),
    getFormatter(),
    courseLeaderboard(course.id, user.id),
  ]);

  const when =
    course.inDays === null
      ? null
      : course.inDays === 0
        ? t("today")
        : course.inDays === 1
          ? t("tomorrow")
          : format.dateTime(weekdayDate(((isoWeekday() - 1 + course.inDays) % 7) + 1), { weekday: "long" });

  return (
    <>
      <PageHead
        title={course.title}
        subtitle={[course.code, course.teacher && t("with", { name: course.teacher.name }), when && t("nextOn", { day: when })].filter(Boolean).join(" · ")}
        crumbs={[{ href: "/student", label: tn("myCourses") }]}
        actions={
          course.next && (
            <Link className="btn btn-bright" href={`/student/quizzes/${course.next.id}`}>
              ▶ {course.next.best ? t("replay") : t("play")} · {course.next.title}
            </Link>
          )
        }
      />

      <section className="subject-summary glass intro" style={{ ["--c" as string]: subjectAccent(course.code) }}>
        <span className="subject-mark" aria-hidden="true">{course.title.trim().charAt(0).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="subject-bar">
            <i style={{ width: `${course.quizzes.length ? Math.round((course.mastered / course.quizzes.length) * 100) : 0}%` }} />
          </span>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <span className="chip">{t("subjectProgress", { done: course.mastered, total: course.quizzes.length })}</span>
            <span className="chip">{t("subjectPlayed", { count: course.played })}</span>
            {course.classDays && (
              <span className="chip">
                <ClassDaysLabel value={course.classDays} />
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel glass intro intro-2">
          <h2>{t("quizzesTitle")}</h2>
          {course.quizzes.length === 0 ? (
            <div className="empty">{t("noQuizzes")}</div>
          ) : (
            <div className="grid-cards">
              {course.quizzes.map((q) => (
                <Link key={q.id} href={`/student/quizzes/${q.id}`} className={`tile glass ${q.id === course.next?.id ? "tile-next" : ""}`}>
                  <div className="spread">
                    <span className={`badge ${isGameMode(q.mode) ? MODE_BADGE[q.mode] : "badge-teal"}`}>
                      {isGameMode(q.mode) ? tg(`${q.mode}.label`) : q.mode}
                    </span>
                    <Stars count={q.stars} />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {isDifficulty(q.difficulty) && (
                      <span className={`badge ${DIFFICULTIES[q.difficulty].badge}`}>
                        {td(`${q.difficulty}.label`)} · {td("xp", { n: DIFFICULTIES[q.difficulty].xpMultiplier })}
                      </span>
                    )}
                    {q.combo && <span className="badge badge-violet">{tpl("optionCombo")}</span>}
                    {q.lives && <span className="badge badge-rose">{tpl("optionSurvival", { count: q.lives })}</span>}
                  </div>
                  <h3>{q.title}</h3>
                  {q.description && <p>{q.description}</p>}
                  <span className="meta">
                    {t("questions", { count: q._count.questions })} ·{" "}
                    {!q.best ? t("new") : q.stars === 3 ? t("mastered") : t("best", { correct: q.best.correctCount, total: q.best.totalQuestions })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel glass intro intro-3">
          <h2>{t("leaderboard")}</h2>
          <Leaderboard rows={leaderWindow(board)} joinHint emptyText={t("leaderboardEmpty")} />
        </section>
      </div>
    </>
  );
}
