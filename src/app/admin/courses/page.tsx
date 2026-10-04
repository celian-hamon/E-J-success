import Link from "next/link";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SearchParams } from "@/lib/flash";
import { matches } from "@/lib/search";
import { meetsOn, weekdayDate, WEEKDAYS } from "@/lib/schedule";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import AutoFilterForm from "@/components/AutoFilterForm";
import SelectAll from "@/components/SelectAll";
import WeekdayPicker, { ClassDaysLabel } from "@/components/WeekdayPicker";
import { bulkCourses, createCourse } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("courses"))("title") };
}

const SORTS = ["code", "title", "students", "recent"] as const;
type Sort = (typeof SORTS)[number];

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q");
  const teacher = str("teacher");
  const cls = str("class");
  const day = Number(str("day")) || 0;
  const sort: Sort = (SORTS as readonly string[]).includes(str("sort")) ? (str("sort") as Sort) : "code";

  const [t, tc, format] = await Promise.all([getTranslations("courses"), getTranslations("common"), getFormatter()]);
  const [all, teachers, classes] = await Promise.all([
    db.course.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        classLinks: { select: { class: { select: { id: true, name: true } } }, orderBy: { class: { name: "asc" } } },
        _count: { select: { enrollments: true, quizzes: true } },
      },
    }),
    db.user.findMany({ where: { role: "TEACHER" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.schoolClass.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Filtering happens here rather than in SQL so search ignores accents and case.
  const courses = all
    .filter((c) => matches(q, c.code, c.title, c.description, c.teacher?.name, ...c.classLinks.map((l) => l.class.name)))
    .filter((c) => (teacher === "none" ? !c.teacherId : teacher ? c.teacherId === teacher : true))
    .filter((c) => (cls === "none" ? c.classLinks.length === 0 : cls ? c.classLinks.some((l) => l.class.id === cls) : true))
    .filter((c) => (day ? meetsOn(c.classDays, weekdayDate(day)) : true))
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "students"
          ? b._count.enrollments - a._count.enrollments
          : sort === "recent"
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.code.localeCompare(b.code),
    );

  const backUrl = `/admin/courses${Object.keys(sp).length ? `?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && !["ok", "error"].includes(k)) as [string, string][])}` : ""}`;
  const filtered = Boolean(q || teacher || cls || day);

  return (
    <>
      <PageHead title={t("title")} subtitle={t("subtitle")} crumbs={[{ href: "/admin", label: tc("admin") }]} />
      <Flash searchParams={searchParams} />

      <section className="panel glass">
        <AutoFilterForm className="filter-bar">
          <input className="input" type="search" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
          <select className="select" name="teacher" defaultValue={teacher} aria-label={t("teacher")}>
            <option value="">{t("allTeachers")}</option>
            <option value="none">{t("noTeacher")}</option>
            {teachers.map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.name}</option>
            ))}
          </select>
          <select className="select" name="class" defaultValue={cls} aria-label={t("class")}>
            <option value="">{t("allClasses")}</option>
            <option value="none">{t("noClass")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="select" name="day" defaultValue={day ? String(day) : ""} aria-label={t("classDays")}>
            <option value="">{t("anyDay")}</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>{format.dateTime(weekdayDate(d), { weekday: "long" })}</option>
            ))}
          </select>
          <select className="select" name="sort" defaultValue={sort} aria-label={t("sort")}>
            {SORTS.map((s) => (
              <option key={s} value={s}>{t(`sorts.${s}`)}</option>
            ))}
          </select>
          {filtered && <Link href="/admin/courses" className="btn btn-sm">{t("reset")}</Link>}
        </AutoFilterForm>

        <form id="bulk" action={bulkCourses}>
          <input type="hidden" name="back" value={backUrl} />
          <div className="bulk-bar">
            <span className="muted" style={{ fontSize: 13 }}>{t("resultCount", { shown: courses.length, total: all.length })}</span>
            <div className="row" style={{ gap: 8 }}>
              <select className="select select-sm" name="classId" defaultValue="" aria-label={t("class")}>
                <option value="">{t("pickClass")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn btn-sm btn-bright" type="submit" name="op" value="addClass">{t("bulkAddClass")}</button>
              <button className="btn btn-sm" type="submit" name="op" value="removeClass">{t("bulkRemoveClass")}</button>
              <select className="select select-sm" name="teacherId" defaultValue="" aria-label={t("teacher")}>
                <option value="">{t("pickTeacher")}</option>
                <option value="none">{t("noTeacher")}</option>
                {teachers.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
              <button className="btn btn-sm" type="submit" name="op" value="setTeacher">{t("bulkSetTeacher")}</button>
            </div>
          </div>
        </form>

        {courses.length === 0 ? (
          <div className="empty">{filtered ? t("noMatch") : t("empty")}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}><SelectAll form="bulk" name="courseId" label={t("selectAll")} /></th>
                  <th>{t("course")}</th>
                  <th>{t("teacher")}</th>
                  <th>{t("classesCol")}</th>
                  <th>{t("classDays")}</th>
                  <th style={{ textAlign: "right" }}>{t("studentsCol")}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" name="courseId" value={c.id} form="bulk" aria-label={c.title} /></td>
                    <td>
                      <Link href={`/admin/courses/${c.id}`} className="row" style={{ gap: 8, flexWrap: "nowrap", textDecoration: "none" }}>
                        <span className="badge badge-violet">{c.code}</span>
                        <strong>{c.title}</strong>
                      </Link>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t("quizCount", { count: c._count.quizzes })}</div>
                    </td>
                    <td>{c.teacher?.name ?? <span className="muted">{t("noTeacher")}</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {c.classLinks.length
                          ? c.classLinks.map((l) => (
                              <Link key={l.class.id} href={`/admin/classes/${l.class.id}`} className="badge badge-teal">{l.class.name}</Link>
                            ))
                          : <span className="muted">—</span>}
                      </div>
                    </td>
                    <td>{c.classDays ? <ClassDaysLabel value={c.classDays} /> : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>{c._count.enrollments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="panel glass" open={all.length === 0}>
        <summary className="panel-title" style={{ cursor: "pointer", margin: 0 }}>＋ {t("newTitle")}</summary>
        <form className="form" action={createCourse} style={{ marginTop: 16 }}>
          <div className="form-row">
            <label className="field">
              <span>{t("code")}</span>
              <input className="input" name="code" placeholder="BIO-101" required />
            </label>
            <label className="field">
              <span>{t("courseTitle")}</span>
              <input className="input" name="title" required />
            </label>
            <label className="field">
              <span>{t("teacher")}</span>
              <select className="select" name="teacherId" defaultValue="">
                <option value="">{t("noTeacherYet")}</option>
                {teachers.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>{t("description")}</span>
            <textarea className="textarea" name="description" />
          </label>
          <div className="field">
            <span>{t("classDays")}</span>
            <WeekdayPicker />
          </div>
          <div>
            <button className="btn btn-bright" type="submit">{t("create")}</button>
          </div>
        </form>
      </details>
    </>
  );
}
