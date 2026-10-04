import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SearchParams } from "@/lib/flash";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import { createClass } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("classes"))("title") };
}

export default async function ClassesPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, tc] = await Promise.all([getTranslations("classes"), getTranslations("common")]);
  const [classes, unassigned] = await Promise.all([
    db.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { students: true, courses: true } },
        courses: { select: { course: { select: { code: true } } }, orderBy: { course: { code: "asc" } } },
      },
    }),
    db.user.count({ where: { role: "STUDENT", classId: null } }),
  ]);

  return (
    <>
      <PageHead title={t("title")} subtitle={t("subtitle")} crumbs={[{ href: "/admin", label: tc("admin") }]} />
      <Flash searchParams={searchParams} />
      {unassigned > 0 && (
        <div className="alert alert-error">
          {t("studentsWithoutClass", { count: unassigned })} <Link href="/admin/users?filter=noclass">{t("seeWho")}</Link>
        </div>
      )}
      <div className="grid-2">
        <section className="stack">
          {classes.length === 0 && <div className="empty glass">{t("empty")}</div>}
          <div className="grid-cards">
            {classes.map((c) => (
              <Link key={c.id} href={`/admin/classes/${c.id}`} className="tile glass">
                <div className="row">
                  {c.level && <span className="badge badge-violet">{c.level}</span>}
                  {c.schoolYear && <span className="badge">{c.schoolYear}</span>}
                </div>
                <h3>{c.name}</h3>
                <p>{c.courses.length ? c.courses.map((cc) => cc.course.code).join(" · ") : t("noCoursesYet")}</p>
                <span className="meta">{t("counts", { students: c._count.students, courses: c._count.courses })}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel glass">
          <h2>{t("newTitle")}</h2>
          <form className="form" action={createClass}>
            <label className="field">
              <span>{t("name")}</span>
              <input className="input" name="name" placeholder={t("namePlaceholder")} required />
            </label>
            <div className="form-row">
              <label className="field">
                <span>{t("level")}</span>
                <input className="input" name="level" placeholder={t("levelPlaceholder")} />
              </label>
              <label className="field">
                <span>{t("schoolYear")}</span>
                <input className="input" name="schoolYear" placeholder="2026-2027" />
              </label>
            </div>
            <button className="btn btn-bright" type="submit">{t("create")}</button>
          </form>
        </section>
      </div>
    </>
  );
}
