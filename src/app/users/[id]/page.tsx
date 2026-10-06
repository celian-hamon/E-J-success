import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { managedCoursesWhere, requireUser } from "@/lib/auth";
import { loadProgress } from "@/lib/gamification/progress";
import { BADGE_IDS } from "@/lib/gamification/badges";
import { starsFor } from "@/lib/gamification/stars";
import { isRole } from "@/lib/roles";
import { moodFor, stageFor, isPetColor } from "@/lib/pet/rules";
import { canSee, parsePrivacy, sectionsFor, type Audience, type ProfileSection, type Relation } from "@/lib/privacy";
import { relationTo } from "@/lib/profile-access";
import PageHead from "@/components/PageHead";
import Avatar from "@/components/Avatar";
import PetSprite from "@/components/PetSprite";
import { BadgeIcon, LevelBar, Stars, StreakFlame } from "@/components/Progress";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await db.user.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: u?.name };
}

/** Anyone signed in can open a profile; each section shows only if its owner allows this viewer. */
export default async function PublicProfile({ params, searchParams }: Props) {
  const viewer = await requireUser();
  const { id } = await params;
  const owner = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, avatar: true, xp: true, classId: true, privacy: true, schoolClass: { select: { name: true } } },
  });
  if (!owner) notFound();
  const [t, tr, tt, tb, tp, format] = await Promise.all([
    getTranslations("publicProfile"),
    getTranslations("roles"),
    getTranslations("tiers"),
    getTranslations("badges"),
    getTranslations("pet"),
    getFormatter(),
  ]);

  // The owner can preview their profile as their class or as everyone sees it.
  const asked = (await searchParams).as;
  const preview: Relation | null = viewer.id === owner.id && (asked === "class" || asked === "other") ? asked : null;
  const relation = preview ?? (await relationTo(viewer, owner));
  const privacy = parsePrivacy(owner.privacy);
  const sections = sectionsFor(owner.role);
  const show = (s: ProfileSection) => sections.includes(s) && canSee(relation, privacy[s]);
  const visible = sections.filter(show);
  const isStudent = owner.role === "STUDENT";
  const audienceNote = (s: ProfileSection) =>
    relation === "self" || relation === "admin" ? <span className="badge">{t(`audience.${privacy[s] as Audience}`)}</span> : null;

  const progress = isStudent && (show("level") || show("stats") || show("badges")) ? await loadProgress(owner.id) : null;
  const stats = show("stats")
    ? await db.attempt.aggregate({ where: { userId: owner.id, completedAt: { not: null } }, _count: true, _sum: { correctCount: true } })
    : null;
  const pet = show("pet") ? await db.pet.findUnique({ where: { userId: owner.id } }) : null;
  const courses = show("courses")
    ? isStudent
      ? (await db.enrollment.findMany({ where: { userId: owner.id }, select: { course: { select: { id: true, code: true, title: true } } }, orderBy: { course: { code: "asc" } } })).map((e) => e.course)
      : await db.course.findMany({ where: managedCoursesWhere(owner.id), select: { id: true, code: true, title: true }, orderBy: { code: "asc" } })
    : [];
  const teaching = show("courses") && !isStudent
    ? await db.classTeacher.findMany({ where: { userId: owner.id }, select: { class: { select: { name: true } } } })
    : [];
  const recent = show("activity")
    ? await db.attempt.findMany({
        where: { userId: owner.id, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 6,
        select: { id: true, completedAt: true, score: true, correctCount: true, totalQuestions: true, quiz: { select: { title: true, course: { select: { code: true } } } } },
      })
    : [];

  return (
    <div className="app">
      <PageHead
        title={owner.name}
        subtitle={[isRole(owner.role) ? tr(owner.role) : owner.role, show("courses") && owner.schoolClass?.name].filter(Boolean).join(" · ")}
        actions={viewer.id === owner.id && <Link className="btn" href="/profile">{t("editPrivacy")}</Link>}
      />

      {preview && (
        <div className="alert glass" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>{t(preview === "class" ? "previewClass" : "previewOther")}</span>
          <Link className="btn btn-sm" href={`/users/${owner.id}`}>{t("previewExit")}</Link>
        </div>
      )}

      <section className="player-card glass intro">
        <Avatar avatar={owner.avatar} size={84} level={isStudent && show("level") && progress ? progress.level.level : undefined} />
        <div>
          {isStudent && show("level") && progress ? (
            <>
              <h2>{tt(progress.level.tier)} {audienceNote("level")}</h2>
              <LevelBar xp={owner.xp} />
            </>
          ) : (
            <h2>{owner.name}</h2>
          )}
        </div>
        {show("stats") && progress && (
          <div className="player-stats">
            <span className="chip"><StreakFlame streak={progress.streak.streak} atRisk={false} /></span>
            <span className="chip">{t.rich("bestStreak", { count: progress.user.longestStreak, b: (c) => <b>{c}</b> })}</span>
            <span className="chip">{t.rich("totals", { quizzes: stats?._count ?? 0, correct: stats?._sum.correctCount ?? 0, b: (c) => <b>{c}</b> })}</span>
            {audienceNote("stats")}
          </div>
        )}
      </section>

      {visible.length === 0 && <div className="empty glass">{t("private", { name: owner.name.split(" ")[0] })}</div>}

      {/* Two columns only when both have something to show (staff profiles have a single section). */}
      <div className={(show("badges") && progress) || show("activity") ? (show("pet") || show("courses") ? "grid-2" : "stack") : "stack"}>
        <div className="stack">
          {show("badges") && progress && (
            <section className="panel glass intro intro-2">
              <h2>{t("badges", { count: progress.badges.length, total: BADGE_IDS.length })} {audienceNote("badges")}</h2>
              {progress.badges.length === 0 ? (
                <div className="empty">{t("noBadges")}</div>
              ) : (
                <div className="badge-grid">
                  {progress.badges.map((b) => (
                    <div key={b} className="badge-card">
                      <BadgeIcon id={b} />
                      <b>{tb(`${b}.name`)}</b>
                      <span className="desc">{tb(`${b}.description`)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {show("activity") && (
            <section className="panel glass intro intro-3">
              <h2>{t("activity")} {audienceNote("activity")}</h2>
              {recent.length === 0 ? (
                <div className="empty">{t("noActivity")}</div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {recent.map((a) => (
                    <div key={a.id} className="activity-row">
                      <span className="badge badge-violet">{a.quiz.course.code}</span>
                      <span className="activity-title">{a.quiz.title}</span>
                      <Stars count={starsFor(a.correctCount, a.totalQuestions)} />
                      <span className="muted">{a.completedAt && format.relativeTime(a.completedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="stack">
          {show("pet") && pet && (
            <section className="panel glass intro intro-2" style={{ textAlign: "center" }}>
              <h2 style={{ textAlign: "left" }}>{t("pet")} {audienceNote("pet")}</h2>
              <PetSprite
                stage={stageFor(pet.mealsEaten).key}
                mood={moodFor(pet.fullness, pet.happiness)}
                color={isPetColor(pet.color) ? pet.color : "teal"}
                size={130}
                label={pet.name}
              />
              <p style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 300 }}>{pet.name}</p>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                {tp(`stages.${stageFor(pet.mealsEaten).key}`)} · {tp(`moods.${moodFor(pet.fullness, pet.happiness)}`)}
              </p>
            </section>
          )}

          {show("courses") && (
            <section className="panel glass intro intro-3">
              <h2>{isStudent ? t("courses") : t("teaches")} {audienceNote("courses")}</h2>
              {!isStudent && teaching.length > 0 && (
                <p className="muted" style={{ marginTop: -6, fontSize: 14 }}>{t("classes", { names: teaching.map((c) => c.class.name).join(", ") })}</p>
              )}
              {courses.length === 0 ? (
                <div className="empty">{t("noCourses")}</div>
              ) : (
                <div className="row" style={{ gap: 8 }}>
                  {courses.map((c) => (
                    <span key={c.id} className="chip"><b>{c.code}</b> {c.title}</span>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
