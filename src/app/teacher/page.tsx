import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import PageHead from "@/components/PageHead";
import { ClassDaysLabel } from "@/components/WeekdayPicker";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("myCourses") };
}

export default async function TeacherHome() {
  const user = await requireRole("TEACHER", "ADMIN");
  const [t, tc] = await Promise.all([getTranslations("teacher"), getTranslations("courses")]);
  const courses = await db.course.findMany({
    where: user.role === "ADMIN" ? undefined : { teacherId: user.id },
    orderBy: { code: "asc" },
    include: { _count: { select: { enrollments: true, quizzes: true } } },
  });

  return (
    <>
      <PageHead
        title={t.rich("title", { tint: (c) => <em className="tint">{c}</em> })}
        subtitle={user.role === "ADMIN" ? t("subtitleAdmin") : t("subtitle")}
      />
      {courses.length === 0 ? (
        <div className="empty glass">{t("noCourses")}</div>
      ) : (
        <div className="grid-cards intro intro-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/teacher/courses/${c.id}`} className="tile glass">
              <span className="badge badge-violet" style={{ alignSelf: "start" }}>{c.code}</span>
              <h3>{c.title}</h3>
              {c.description && <p>{c.description}</p>}
              {c.classDays && <p className="muted"><ClassDaysLabel value={c.classDays} /></p>}
              <span className="meta">{tc("counts", { students: c._count.enrollments, quizzes: c._count.quizzes })}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
