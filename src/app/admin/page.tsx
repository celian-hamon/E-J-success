import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import PageHead from "@/components/PageHead";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("metaTitle") };
}

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const [classes, courses, students, teachers, quizzes, attempts, unassigned] = await Promise.all([
    db.schoolClass.count(),
    db.course.count(),
    db.user.count({ where: { role: "STUDENT" } }),
    db.user.count({ where: { role: "TEACHER" } }),
    db.quiz.count({ where: { published: true } }),
    db.attempt.count({ where: { completedAt: { not: null } } }),
    db.user.count({ where: { role: "STUDENT", classId: null } }),
  ]);

  const stats = [
    { key: "classes", value: classes, c: "var(--rose)" },
    { key: "courses", value: courses, c: "var(--teal)" },
    { key: "students", value: students, c: "var(--lilac)" },
    { key: "teachers", value: teachers, c: "var(--rose)" },
    { key: "published", value: quizzes, c: "var(--teal)" },
    { key: "played", value: attempts, c: "var(--lilac)" },
  ] as const;

  return (
    <>
      <PageHead
        title={t.rich("title", { tint: (c) => <em className="tint">{c}</em> })}
        subtitle={t("subtitle")}
        actions={
          <>
            <Link className="btn" href="/admin/users">{t("manageUsers")}</Link>
            <Link className="btn" href="/admin/classes">{t("manageClasses")}</Link>
            <Link className="btn btn-bright" href="/admin/courses">{t("manageCourses")}</Link>
          </>
        }
      />
      <div className="grid-cards intro intro-2">
        {stats.map((s) => (
          <div key={s.key} className="stat glass" style={{ ["--c" as string]: s.c }}>
            <b>{s.value}</b>
            <span>{t(`stats.${s.key}`)}</span>
          </div>
        ))}
      </div>
      {unassigned > 0 && (
        <div className="alert alert-error intro intro-3">
          {t("unassigned", { count: unassigned })} <Link href="/admin/users?filter=noclass">{t("seeWho")}</Link>
        </div>
      )}
    </>
  );
}
