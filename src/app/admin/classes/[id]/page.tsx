import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SearchParams } from "@/lib/flash";
import { levelInfo } from "@/lib/gamification/levels";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import Avatar from "@/components/Avatar";
import WeekdayPicker, { ClassDaysLabel } from "@/components/WeekdayPicker";
import FilterList from "@/components/FilterList";
import ConfirmButton from "@/components/ConfirmButton";
import { createCourse } from "../../actions";
import {
  addCoursesToClass,
  addStudentsToClass,
  addTeachersToClass,
  deleteClass,
  removeTeacherFromClass,
  removeCourseFromClass,
  removeStudentFromClass,
  updateClass,
} from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cls = await db.schoolClass.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: cls?.name };
}

export default async function ClassPage({ params, searchParams }: Props) {
  const { id } = await params;
  const [t, tc] = await Promise.all([getTranslations("classes"), getTranslations("common")]);
  const cls = await db.schoolClass.findUnique({
    where: { id },
    include: {
      students: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, avatar: true, xp: true } },
      teachers: { orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
      courses: {
        include: { course: { select: { id: true, code: true, title: true, classDays: true, teacher: { select: { name: true } } } } },
        orderBy: { course: { code: "asc" } },
      },
    },
  });
  if (!cls) notFound();

  const linked = new Set(cls.courses.map((c) => c.courseId));
  const [otherStudents, otherCourses, teachers] = await Promise.all([
    db.user.findMany({
      where: { role: "STUDENT", OR: [{ classId: null }, { classId: { not: id } }] },
      orderBy: [{ classId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, schoolClass: { select: { name: true } } },
    }),
    db.course.findMany({
      where: { id: { notIn: [...linked] } },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        teacher: { select: { name: true } },
        classLinks: { select: { class: { select: { name: true } } } },
      },
    }),
    db.user.findMany({
      where: { role: "TEACHER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, teaching: { select: { class: { select: { name: true } } } } },
    }),
  ]);
  const assigned = new Set(cls.teachers.map((ct) => ct.user.id));
  const otherTeachers = teachers.filter((tt) => !assigned.has(tt.id));

  return (
    <>
      <PageHead
        title={cls.name}
        subtitle={[cls.level, cls.schoolYear, t("counts", { students: cls.students.length, courses: cls.courses.length })].filter(Boolean).join(" · ")}
        crumbs={[
          { href: "/admin", label: tc("admin") },
          { href: "/admin/classes", label: t("title") },
        ]}
      />
      <Flash searchParams={searchParams} />

      <div className="grid-2">
        <div className="stack">
          <section className="panel glass">
            <h2>{t("studentsTitle")}</h2>
            {cls.students.length === 0 ? (
              <div className="empty">{t("noStudents")}</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <tbody>
                    {cls.students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="row" style={{ flexWrap: "nowrap" }}>
                            <Avatar avatar={s.avatar} size={34} level={levelInfo(s.xp).level} />
                            <div>
                              <Link href={`/users/${s.id}`}><strong>{s.name}</strong></Link>
                              <div className="muted" style={{ fontSize: 13 }}>{s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <form action={removeStudentFromClass}>
                            <input type="hidden" name="classId" value={cls.id} />
                            <input type="hidden" name="userId" value={s.id} />
                            <button className="btn btn-sm btn-danger" type="submit">{tc("remove")}</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel glass">
            <h2>{t("teachersTitle")}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 14 }}>{t("teachersHint")}</p>
            {cls.teachers.length === 0 ? (
              <div className="empty">{t("noTeachers")}</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {cls.teachers.map(({ user: tt }) => (
                  <div key={tt.id} className="meal-row">
                    <Avatar avatar={tt.avatar} size={34} />
                    <div>
                      <Link href={`/users/${tt.id}`}><strong style={{ fontWeight: 400 }}>{tt.name}</strong></Link>
                      <div className="muted" style={{ fontSize: 13 }}>{tt.email}</div>
                    </div>
                    <form action={removeTeacherFromClass}>
                      <input type="hidden" name="classId" value={cls.id} />
                      <input type="hidden" name="userId" value={tt.id} />
                      <button className="btn btn-sm btn-danger" type="submit">{tc("remove")}</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            {otherTeachers.length > 0 && (
              <form className="form" action={addTeachersToClass} style={{ marginTop: 14 }}>
                <input type="hidden" name="classId" value={cls.id} />
                <FilterList
                  name="teacherId"
                  placeholder={t("searchTeachers")}
                  emptyText={t("allTeachersAssigned")}
                  items={otherTeachers.map((tt) => ({
                    id: tt.id,
                    label: tt.name,
                    hint: [tt.email, ...tt.teaching.map((x) => x.class.name)].join(" · "),
                  }))}
                />
                <button className="btn btn-bright btn-sm" type="submit">{t("addTeachersSubmit")}</button>
              </form>
            )}
          </section>

          <section className="panel glass">
            <h2>{t("coursesTitle")}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 14 }}>{t("coursesHint")}</p>
            {cls.courses.length === 0 ? (
              <div className="empty">{t("noCourses")}</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {cls.courses.map(({ course }) => (
                  <div key={course.id} className="meal-row">
                    <span className="badge badge-violet">{course.code}</span>
                    <div>
                      <Link href={`/admin/courses/${course.id}`}><strong style={{ fontWeight: 400 }}>{course.title}</strong></Link>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {course.teacher?.name ?? t("noTeacher")}
                        {course.classDays && <> · <ClassDaysLabel value={course.classDays} /></>}
                      </div>
                    </div>
                    <form action={removeCourseFromClass}>
                      <input type="hidden" name="classId" value={cls.id} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <button className="btn btn-sm btn-danger" type="submit">{tc("remove")}</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel glass">
            <h2>{t("addStudents")}</h2>
            <form className="form" action={addStudentsToClass}>
              <input type="hidden" name="classId" value={cls.id} />
              <FilterList
                name="studentId"
                placeholder={t("searchStudents")}
                emptyText={t("allInClass")}
                items={otherStudents.map((s) => ({
                  id: s.id,
                  label: s.name,
                  hint: `${s.schoolClass ? t("currentlyIn", { name: s.schoolClass.name }) : t("noClass")} · ${s.email}`,
                }))}
              />
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{t("moveHint")}</p>
              <label className="field">
                <span>{t("pasteEmails")}</span>
                <textarea className="textarea" name="emails" placeholder="un@ecole.fr, deux@ecole.fr" />
              </label>
              <button className="btn btn-bright" type="submit">{t("addStudentsSubmit")}</button>
            </form>
          </section>

          <section className="panel glass">
            <h2>{t("addCourses")}</h2>
            <form className="form" action={addCoursesToClass}>
              <input type="hidden" name="classId" value={cls.id} />
              <FilterList
                name="courseId"
                placeholder={t("searchCourses")}
                emptyText={t("allCoursesLinked")}
                items={otherCourses.map((c) => ({
                  id: c.id,
                  badge: c.code,
                  label: c.title,
                  hint: [c.teacher?.name, ...c.classLinks.map((l) => l.class.name)].filter(Boolean).join(" · "),
                }))}
              />
              {otherCourses.length > 0 && <button className="btn btn-bright" type="submit">{t("addCoursesSubmit")}</button>}
            </form>
          </section>

          <details className="panel glass">
            <summary className="panel-title" style={{ cursor: "pointer", margin: 0 }}>＋ {t("quickCreate")}</summary>
            <form className="form" action={createCourse} style={{ marginTop: 14 }}>
              <input type="hidden" name="classId" value={cls.id} />
              <div className="form-row">
                <label className="field">
                  <span>{t("courseCode")}</span>
                  <input className="input" name="code" placeholder="MATH-6A" required />
                </label>
                <label className="field">
                  <span>{t("courseTitle")}</span>
                  <input className="input" name="title" required />
                </label>
              </div>
              <label className="field">
                <span>{t("courseTeacher")}</span>
                <select className="select" name="teacherId" defaultValue="">
                  <option value="">{tc("none")}</option>
                  {teachers.map((tt) => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>{t("courseDays")}</span>
                <WeekdayPicker />
              </div>
              <div>
                <button className="btn btn-bright btn-sm" type="submit">{t("quickCreateSubmit")}</button>
              </div>
            </form>
          </details>

          <section className="panel glass">
            <h2>{t("details")}</h2>
            <form className="form" action={updateClass}>
              <input type="hidden" name="id" value={cls.id} />
              <label className="field">
                <span>{t("name")}</span>
                <input className="input" name="name" defaultValue={cls.name} required />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>{t("level")}</span>
                  <input className="input" name="level" defaultValue={cls.level ?? ""} />
                </label>
                <label className="field">
                  <span>{t("schoolYear")}</span>
                  <input className="input" name="schoolYear" defaultValue={cls.schoolYear ?? ""} />
                </label>
              </div>
              <button className="btn" type="submit">{tc("saveChanges")}</button>
            </form>
            <form action={deleteClass} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={cls.id} />
              <ConfirmButton className="btn btn-sm btn-danger" message={tc("confirmDeleteClass", { name: cls.name })}>
                {t("delete")}
              </ConfirmButton>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
