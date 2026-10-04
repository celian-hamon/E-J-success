import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { levelInfo } from "@/lib/gamification/levels";
import { ROLE_HOME, type Role } from "@/lib/roles";
import { logout } from "@/app/actions/auth";
import { Brand } from "./Brand";
import Avatar from "./Avatar";

type NavKey = "overview" | "classes" | "courses" | "users" | "quizzes" | "myCourses" | "pet" | "leaderboard";

const LINKS: Record<Role, { href: string; key: NavKey }[]> = {
  ADMIN: [
    { href: "/admin", key: "overview" },
    { href: "/admin/classes", key: "classes" },
    { href: "/admin/courses", key: "courses" },
    { href: "/admin/users", key: "users" },
    { href: "/teacher", key: "quizzes" },
    { href: "/leaderboard", key: "leaderboard" },
  ],
  TEACHER: [
    { href: "/teacher", key: "myCourses" },
    { href: "/leaderboard", key: "leaderboard" },
  ],
  STUDENT: [
    { href: "/student", key: "myCourses" },
    { href: "/student/pet", key: "pet" },
    { href: "/leaderboard", key: "leaderboard" },
  ],
};

export default async function Nav() {
  const [user, t, tr] = await Promise.all([getCurrentUser(), getTranslations("nav"), getTranslations("roles")]);
  const profile = user ? await db.user.findUnique({ where: { id: user.id }, select: { avatar: true, xp: true } }) : null;

  return (
    <header className="nav glass intro">
      <Brand href={user ? ROLE_HOME[user.role] : "/"} />
      {user ? (
        <>
          <nav className="nav-links" aria-label={t("primary")}>
            {LINKS[user.role].map((l) => (
              <Link key={l.href} href={l.href}>
                {t(l.key)}
              </Link>
            ))}
          </nav>
          <div className="nav-user">
            <Link href="/profile" className="nav-avatar" title={t("profile")}>
              <Avatar avatar={profile?.avatar ?? null} size={32} level={user.role === "STUDENT" ? levelInfo(profile?.xp ?? 0).level : undefined} />
              <span className="who">
                {user.name} · {tr(user.role)}
              </span>
            </Link>
            <form action={logout}>
              <button className="btn btn-sm" type="submit">
                {t("signOut")}
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <nav className="nav-links" aria-label={t("primary")}>
            <a href="/#how">{t("howItWorks")}</a>
            <a href="/#roles">{t("forSchools")}</a>
          </nav>
          <Link className="btn btn-bright" href="/login">
            {t("signIn")}
          </Link>
        </>
      )}
    </header>
  );
}
