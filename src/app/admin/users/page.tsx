import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ROLES, isRole } from "@/lib/roles";
import type { SearchParams } from "@/lib/flash";
import { levelInfo } from "@/lib/gamification/levels";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import Avatar from "@/components/Avatar";
import { createUser, deleteUser } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("users"))("title") };
}

const ROLE_BADGE = { ADMIN: "badge-rose", TEACHER: "badge-violet", STUDENT: "badge-teal" } as const;

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireRole("ADMIN");
  const [t, tc, tr] = await Promise.all([getTranslations("users"), getTranslations("common"), getTranslations("roles")]);
  const sp = await searchParams;
  const filter = sp.filter === "unassigned" ? "unassigned" : sp.filter === "noclass" ? "noclass" : null;

  const [users, classes] = await Promise.all([
    db.user.findMany({
      where:
        filter === "unassigned"
          ? { role: "STUDENT", enrollments: { none: {} } }
          : filter === "noclass"
            ? { role: "STUDENT", classId: null }
            : undefined,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        enrollments: { include: { course: { select: { code: true } } } },
        taught: { select: { code: true } },
        schoolClass: { select: { id: true, name: true } },
      },
    }),
    db.schoolClass.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHead
        title={t("title")}
        subtitle={filter === "unassigned" ? t("subtitleUnassigned") : filter === "noclass" ? t("subtitleNoClass") : t("subtitle")}
        crumbs={[{ href: "/admin", label: tc("admin") }]}
      />
      <Flash searchParams={searchParams} />
      <div className="grid-2">
        <section className="panel glass">
          <h2>{t("count", { count: users.length })}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("role")}</th>
                  <th>{t("class")}</th>
                  <th>{t("courses")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const role = isRole(u.role) ? u.role : "STUDENT";
                  const courses = role === "TEACHER" ? u.taught.map((c) => c.code) : u.enrollments.map((e) => e.course.code);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <Avatar avatar={u.avatar} size={34} level={role === "STUDENT" ? levelInfo(u.xp).level : undefined} />
                          <div>
                            <strong>{u.name}</strong>
                            <div className="muted" style={{ fontSize: 13 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${ROLE_BADGE[role]}`}>{tr(role)}</span></td>
                      <td>
                        {u.schoolClass ? (
                          <Link href={`/admin/classes/${u.schoolClass.id}`}>{u.schoolClass.name}</Link>
                        ) : role === "STUDENT" ? (
                          <span className="muted">{tc("none")}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{role === "ADMIN" ? tc("all") : courses.join(", ") || <span className="muted">{tc("none")}</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        {u.id !== me.id && (
                          <form action={deleteUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="btn btn-sm btn-danger" type="submit">{tc("delete")}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel glass">
          <h2>{t("addTitle")}</h2>
          <form className="form" action={createUser}>
            <label className="field">
              <span>{t("fullName")}</span>
              <input className="input" name="name" required />
            </label>
            <label className="field">
              <span>{t("email")}</span>
              <input className="input" name="email" type="email" required />
            </label>
            <label className="field">
              <span>{t("role")}</span>
              <select className="select" name="role" defaultValue="STUDENT">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{tr(r)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("classForStudent")}</span>
              <select className="select" name="classId" defaultValue="">
                <option value="">{tc("none")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("tempPassword")}</span>
              <input className="input" name="password" type="text" minLength={8} required autoComplete="off" />
            </label>
            <button className="btn btn-bright" type="submit">{t("create")}</button>
          </form>
        </section>
      </div>
    </>
  );
}
