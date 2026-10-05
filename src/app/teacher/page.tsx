import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { managedCoursesWhere, requireRole } from "@/lib/auth";
import { TEACHER_CLASS_COOKIE } from "@/lib/teacher-class";
import PageHead from "@/components/PageHead";
import { ClassDaysLabel } from "@/components/WeekdayPicker";
import ClassSwitcher from "./ClassSwitcher";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("myCourses") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TeacherHome({ searchParams }: Props) {
  const user = await requireRole("TEACHER", "ADMIN");
  const [t, tc] = await Promise.all([getTranslations("teacher"), getTranslations("courses")]);
  const isAdmin = user.role === "ADMIN";

  const courses = await db.course.findMany({
    where: isAdmin ? undefined : managedCoursesWhere(user.id),
    orderBy: { code: "asc" },
    include: {
      _count: { select: { enrollments: true, quizzes: true } },
      classLinks: { select: { classId: true } },
    },
  });

  // The switcher's classes: the ones the teacher is assigned to, plus those of their courses.
  const classIds = new Set(courses.flatMap((c) => c.classLinks.map((l) => l.classId)));
  const classes = await db.schoolClass.findMany({
    where: isAdmin ? undefined : { OR: [{ id: { in: [...classIds] } }, { teachers: { some: { userId: user.id } } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });

  // Picked class: from the link, else the last one picked (cookie), else all.
  const asked = (await searchParams).class;
  const remembered = (await cookies()).get(TEACHER_CLASS_COOKIE)?.value;
  const wanted = typeof asked === "string" ? asked : remembered;
  const current = classes.find((c) => c.id === wanted) ?? null;
  const shown = current ? courses.filter((c) => c.classLinks.some((l) => l.classId === current.id)) : courses;

  return (
    <>
      <PageHead
        title={t.rich("title", { tint: (c) => <em className="tint">{c}</em> })}
        subtitle={
          current
            ? t("classSubtitle", { name: current.name, students: current._count.students, courses: shown.length })
            : isAdmin
              ? t("subtitleAdmin")
              : t("subtitle")
        }
        actions={isAdmin && current && <Link className="btn" href={`/admin/classes/${current.id}`}>{t("manageClass")}</Link>}
      />
      {classes.length > 1 || (classes.length === 1 && courses.length > shown.length) ? (
        <ClassSwitcher
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          current={current?.id ?? "all"}
          allLabel={isAdmin ? t("allClassesAdmin") : t("allClasses")}
          label={t("switchClass")}
        />
      ) : null}
      {courses.length === 0 ? (
        <div className="empty glass">{t("noCourses")}</div>
      ) : shown.length === 0 ? (
        <div className="empty glass">{t("noCoursesInClass")}</div>
      ) : (
        <div className="grid-cards intro intro-2">
          {shown.map((c) => (
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
