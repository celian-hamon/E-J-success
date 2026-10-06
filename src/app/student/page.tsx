import Link from "next/link";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { loadProgress } from "@/lib/gamification/progress";
import { XP } from "@/lib/gamification/engine";
import { syncPet } from "@/lib/pet/engine";
import { isPetColor } from "@/lib/pet/rules";
import { isoWeekday, weekdayDate } from "@/lib/schedule";
import { loadStudentCourses, nextClass, subjectAccent } from "@/lib/student-courses";
import PageHead from "@/components/PageHead";
import Avatar from "@/components/Avatar";
import PetSprite from "@/components/PetSprite";
import { LevelBar, StreakFlame } from "@/components/Progress";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("myCourses") };
}

export default async function StudentHome() {
  const user = await requireRole("STUDENT");
  const [t, tp, tt, format, progress, pet, courses] = await Promise.all([
    getTranslations("student"),
    getTranslations("pet"),
    getTranslations("tiers"),
    getFormatter(),
    loadProgress(user.id),
    syncPet(user.id),
    loadStudentCourses(user.id),
  ]);

  const { streak } = progress;
  const mealsLeft = pet.meals.filter((m) => m.status === "todo").length;
  const mealsReady = pet.meals.filter((m) => m.status === "ready").length;

  // "Today", "Tomorrow" or the weekday's name.
  const when = (inDays: number) =>
    inDays === 0
      ? t("today")
      : inDays === 1
        ? t("tomorrow")
        : format.dateTime(weekdayDate(((isoWeekday() - 1 + inDays) % 7) + 1), { weekday: "long" });

  // The next class; without any timetable, the subject with the most left to play.
  const upcoming = nextClass(courses) ?? [...courses].sort((a, b) => b.quizzes.length - b.mastered - (a.quizzes.length - a.mastered))[0] ?? null;
  const mealToEarn = upcoming && pet.meals.some((m) => m.course.id === upcoming.id && m.status === "todo");

  return (
    <>
      <PageHead
        title={t.rich("title", { name: user.name.split(" ")[0], tint: (c) => <em className="tint">{c}</em> })}
        subtitle={progress.user.schoolClass ? t("subtitleClass", { name: progress.user.schoolClass.name }) : t("subtitle")}
      />

      {upcoming && (
        <section className="next-class glass intro" style={{ ["--c" as string]: subjectAccent(upcoming.code) }}>
          <div className="next-class-when">
            <span className="eyebrow">{t("nextClass")}</span>
            <strong>{upcoming.inDays === null ? t("toReview") : when(upcoming.inDays)}</strong>
          </div>
          <div className="next-class-body">
            <span className="badge badge-violet">{upcoming.code}</span>
            <h2>{upcoming.title}</h2>
            <p className="muted">
              {upcoming.teacher ? `${t("with", { name: upcoming.teacher.name })} · ` : ""}
              {t("subjectProgress", { done: upcoming.mastered, total: upcoming.quizzes.length })}
            </p>
            {mealToEarn && <p className="next-class-meal">🍎 {t("mealToEarn", { name: pet.pet.name })}</p>}
          </div>
          <div className="next-class-actions">
            {upcoming.next && (
              <Link className="btn btn-bright" href={`/student/quizzes/${upcoming.next.id}`}>
                ▶ {upcoming.next.best ? t("replay") : t("play")} · {upcoming.next.title}
              </Link>
            )}
            <Link className="btn" href={`/student/courses/${upcoming.id}`}>
              {t("openSubject")} →
            </Link>
          </div>
        </section>
      )}

      <section className="player-card glass intro intro-2">
        <Link href="/profile" title={t("customizeAvatar")}>
          <Avatar avatar={progress.user.avatar} size={72} level={progress.level.level} />
        </Link>
        <div>
          <h2>{tt(progress.level.tier)}</h2>
          <LevelBar xp={progress.user.xp} />
        </div>
        <div className="player-stats">
          <span className="chip"><StreakFlame streak={streak.streak} atRisk={streak.atRisk} /></span>
          <span className="chip">
            {streak.playedToday ? t("dailyDone") : t.rich("dailyGoal", { xp: XP.dailyFirst, b: (c) => <b>{c}</b> })}
          </span>
          <Link href="/profile" className="chip" style={{ textDecoration: "none" }}>
            {t.rich("badges", { count: progress.badges.length, b: (c) => <b>{c}</b> })}
          </Link>
        </div>
      </section>

      <Link href="/student/pet" className="pet-widget glass intro intro-2">
        <PetSprite stage={pet.stage.key} mood={pet.mood} color={isPetColor(pet.pet.color) ? pet.pet.color : "teal"} size={78} label={pet.pet.name} />
        <div>
          <strong style={{ fontWeight: 400, fontSize: 18 }}>{pet.pet.name}</strong>
          <div className="muted" style={{ fontSize: 14 }}>{tp(`moods.${pet.mood}`)}</div>
        </div>
        <span className="chip">
          {pet.meals.length === 0
            ? tp("restDayShort")
            : mealsReady > 0
              ? tp("mealsReady", { count: mealsReady })
              : mealsLeft > 0
                ? tp("mealsLeft", { count: mealsLeft })
                : tp("allFed")}
        </span>
      </Link>

      {courses.length === 0 ? (
        <div className="empty glass">{t("noCourses")}</div>
      ) : (
        <section className="intro intro-3">
          <h2 className="panel-title" style={{ margin: "6px 4px 14px" }}>{t("subjects")}</h2>
          <div className="subject-grid">
            {courses.map((c) => {
              const pct = c.quizzes.length ? Math.round((c.mastered / c.quizzes.length) * 100) : 0;
              return (
                <Link key={c.id} href={`/student/courses/${c.id}`} className="subject glass" style={{ ["--c" as string]: subjectAccent(c.code) }}>
                  <span className="subject-mark" aria-hidden="true">{c.title.trim().charAt(0).toUpperCase()}</span>
                  <span className="subject-body">
                    <strong>{c.title}</strong>
                    <span className="muted">
                      {c.code}
                      {c.inDays !== null && ` · ${when(c.inDays)}`}
                    </span>
                    <span className="subject-bar" aria-label={t("subjectProgress", { done: c.mastered, total: c.quizzes.length })}>
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="subject-meta">
                      {c.quizzes.length === 0
                        ? t("noQuizzesShort")
                        : t("subjectProgress", { done: c.mastered, total: c.quizzes.length })}
                      {c.inDays === 0 && <span className="badge badge-teal">🍎 {t("classToday")}</span>}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
