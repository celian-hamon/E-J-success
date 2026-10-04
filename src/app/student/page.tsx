import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isGameMode, MODE_BADGE } from "@/lib/game-modes";
import { DIFFICULTIES, isDifficulty } from "@/lib/difficulty";
import { courseLeaderboard, leaderWindow } from "@/lib/gamification/leaderboard";
import { loadProgress } from "@/lib/gamification/progress";
import { starsFor } from "@/lib/gamification/stars";
import { XP } from "@/lib/gamification/engine";
import { syncPet } from "@/lib/pet/engine";
import { isPetColor } from "@/lib/pet/rules";
import { meetsOn } from "@/lib/schedule";
import PageHead from "@/components/PageHead";
import Avatar from "@/components/Avatar";
import PetSprite from "@/components/PetSprite";
import { LevelBar, Leaderboard, Stars, StreakFlame } from "@/components/Progress";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("myCourses") };
}

export default async function StudentHome() {
  const user = await requireRole("STUDENT");
  const [tpl, td, t, tp, tg, tt, progress, pet, enrollments] = await Promise.all([
    getTranslations("player"),
    getTranslations("difficulty"),
    getTranslations("student"),
    getTranslations("pet"),
    getTranslations("gameModes"),
    getTranslations("tiers"),
    loadProgress(user.id),
    syncPet(user.id),
    db.enrollment.findMany({
      where: { userId: user.id },
      orderBy: { course: { code: "asc" } },
      include: {
        course: {
          include: {
            teacher: { select: { name: true } },
            quizzes: {
              where: { published: true },
              orderBy: { createdAt: "desc" },
              include: {
                _count: { select: { questions: true } },
                attempts: {
                  where: { userId: user.id, completedAt: { not: null } },
                  orderBy: { correctCount: "desc" },
                  take: 1,
                  select: { score: true, correctCount: true, totalQuestions: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const boards = await Promise.all(enrollments.map((e) => courseLeaderboard(e.course.id, user.id)));
  const { streak } = progress;
  const mealsLeft = pet.meals.filter((m) => m.status === "todo").length;
  const mealsReady = pet.meals.filter((m) => m.status === "ready").length;

  return (
    <>
      <PageHead
        title={t.rich("title", { name: user.name.split(" ")[0], tint: (c) => <em className="tint">{c}</em> })}
        subtitle={progress.user.schoolClass ? t("subtitleClass", { name: progress.user.schoolClass.name }) : t("subtitle")}
      />

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

      {enrollments.length === 0 && <div className="empty glass">{t("noCourses")}</div>}

      {enrollments.map(({ course }, i) => {
        const board = boards[i];
        const today = meetsOn(course.classDays);
        return (
          <section key={course.id} className="panel glass intro intro-3">
            <div style={{ marginBottom: 16 }}>
              <div className="row">
                <span className="badge badge-violet">{course.code}</span>
                {today && <span className="badge badge-teal">🍎 {t("classToday")}</span>}
              </div>
              <h2 style={{ margin: "8px 0 0", fontWeight: 300, fontSize: 24 }}>{course.title}</h2>
              {course.teacher && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t("with", { name: course.teacher.name })}</p>}
            </div>
            <div className="grid-2">
              {course.quizzes.length === 0 ? (
                <div className="empty">{t("noQuizzes")}</div>
              ) : (
                <div className="grid-cards">
                  {course.quizzes.map((q) => {
                    const best = q.attempts[0];
                    const stars = best ? starsFor(best.correctCount, best.totalQuestions) : 0;
                    return (
                      <Link key={q.id} href={`/student/quizzes/${q.id}`} className="tile glass">
                        <div className="spread">
                          <span className={`badge ${isGameMode(q.mode) ? MODE_BADGE[q.mode] : "badge-teal"}`}>
                            {isGameMode(q.mode) ? tg(`${q.mode}.label`) : q.mode}
                          </span>
                          <Stars count={stars} />
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
                          {!best
                            ? t("new")
                            : stars === 3
                              ? t("mastered")
                              : t("best", { correct: best.correctCount, total: best.totalQuestions })}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <div>
                <p className="panel-title">{t("leaderboard")}</p>
                <Leaderboard rows={leaderWindow(board)} joinHint emptyText={t("leaderboardEmpty")} />
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
