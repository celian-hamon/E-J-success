import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SearchParams } from "@/lib/flash";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import WeekdayPicker from "@/components/WeekdayPicker";
import FilterList from "@/components/FilterList";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteCourse, duplicateCourse, enrollStudents, setCourseClasses, unenrollStudent, updateCourse } from "../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await db.course.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: course?.title };
}

export default async function AdminCoursePage({ params, searchParams }: Props) {
  const { id } = await params;
  const [t, tc] = await Promise.all([getTranslations("courses"), getTranslations("common")]);
  const course = await db.course.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { user: { select: { id: true, name: true, email: true } }, viaClass: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      },
      classLinks: { include: { class: { select: { id: true, name: true } } }, orderBy: { class: { name: "asc" } } },
      _count: { select: { quizzes: true } },
    },
  });
  if (!course) notFound();

  const enrolledIds = course.enrollments.map((e) => e.userId);
  const [teachers, available, classes] = await Promise.all([
    db.user.findMany({ where: { role: "TEACHER" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { role: "STUDENT", id: { notIn: enrolledIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, schoolClass: { select: { name: true } } },
    }),
    db.schoolClass.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { students: true } } } }),
  ]);
  const linkedClassIds = new Set(course.classLinks.map((l) => l.classId));

  return (
    <>
      <PageHead
        title={course.title}
        subtitle={`${course.code} · ${t("counts", { students: course.enrollments.length, quizzes: course._count.quizzes })}`}
        crumbs={[
          { href: "/admin", label: tc("admin") },
          { href: "/admin/courses", label: t("title") },
        ]}
        actions={
          <>
            <form action={duplicateCourse}>
              <input type="hidden" name="id" value={course.id} />
              <button className="btn" type="submit" title={t("duplicateHint")}>{t("duplicate")}</button>
            </form>
            <Link className="btn" href={`/teacher/courses/${course.id}`}>{t("openQuizzes")}</Link>
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid-2">
        <section className="panel glass">
          <h2>{t("assigned")}</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 14 }}>
            {course.classLinks.length ? (
              <>
                {t("viaClasses")}{" "}
                {course.classLinks.map((l, i) => (
                  <span key={l.classId}>
                    {i > 0 && ", "}
                    <Link href={`/admin/classes/${l.class.id}`}>{l.class.name}</Link>
                  </span>
                ))}
              </>
            ) : (
              t("noClassLinked")
            )}
          </p>
          {course.enrollments.length === 0 ? (
            <div className="empty">{t("noStudents")}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {course.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.user.name}</strong>
                        <div className="muted" style={{ fontSize: 13 }}>{e.user.email}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {e.viaClass ? (
                          <Link className="badge badge-violet" href={`/admin/classes/${e.viaClass.id}`} title={t("viaClassHint")}>
                            {t("viaClass", { name: e.viaClass.name })}
                          </Link>
                        ) : (
                          <form action={unenrollStudent}>
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="userId" value={e.userId} />
                            <button className="btn btn-sm btn-danger" type="submit">{tc("remove")}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel glass">
            <h2>{t("classesPanel")}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{t("classesPanelHint")}</p>
            {classes.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t("noClassesYet")} <Link href="/admin/classes">{t("createClass")}</Link>
              </p>
            ) : (
              <form className="form" action={setCourseClasses}>
                <input type="hidden" name="courseId" value={course.id} />
                <div className="row" style={{ gap: 6 }}>
                  {classes.map((c) => (
                    <label key={c.id} className="day-chip">
                      <input type="checkbox" name="classId" value={c.id} defaultChecked={linkedClassIds.has(c.id)} />
                      <span style={{ textTransform: "none" }}>
                        {c.name} <span className="muted">· {c._count.students}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <button className="btn btn-bright btn-sm" type="submit">{t("saveClasses")}</button>
                </div>
              </form>
            )}
          </section>

          <section className="panel glass">
            <h2>{t("assignTitle")}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{t("assignHint")}</p>
            <form className="form" action={enrollStudents}>
              <input type="hidden" name="courseId" value={course.id} />
              <FilterList
                name="studentId"
                placeholder={t("searchStudents")}
                emptyText={t("allEnrolled")}
                items={available.map((s) => ({
                  id: s.id,
                  label: s.name,
                  hint: s.schoolClass ? `${s.schoolClass.name} · ${s.email}` : s.email,
                }))}
              />
              <label className="field">
                <span>{t("pasteEmails")}</span>
                <textarea className="textarea" name="emails" placeholder="un@ecole.fr, deux@ecole.fr" />
              </label>
              <button className="btn btn-bright" type="submit">{t("assignSubmit")}</button>
            </form>
          </section>

          <section className="panel glass">
            <h2>{t("details")}</h2>
            <form className="form" action={updateCourse}>
              <input type="hidden" name="id" value={course.id} />
              <div className="form-row">
                <label className="field">
                  <span>{t("code")}</span>
                  <input className="input" name="code" defaultValue={course.code} required />
                </label>
                <label className="field">
                  <span>{t("teacher")}</span>
                  <select className="select" name="teacherId" defaultValue={course.teacherId ?? ""}>
                    <option value="">{tc("none")}</option>
                    {teachers.map((tt) => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>{t("courseTitle")}</span>
                <input className="input" name="title" defaultValue={course.title} required />
              </label>
              <label className="field">
                <span>{t("description")}</span>
                <textarea className="textarea" name="description" defaultValue={course.description ?? ""} />
              </label>
              <div className="field">
                <span>{t("classDays")}</span>
                <WeekdayPicker value={course.classDays} />
                <span className="muted" style={{ fontSize: 12.5, textTransform: "none", letterSpacing: 0 }}>{t("classDaysHint")}</span>
              </div>
              <button className="btn" type="submit">{tc("saveChanges")}</button>
            </form>
            <form action={deleteCourse} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={course.id} />
              <ConfirmButton className="btn btn-sm btn-danger" message={tc("confirmDeleteCourse", { code: course.code })}>
                {t("delete")}
              </ConfirmButton>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
