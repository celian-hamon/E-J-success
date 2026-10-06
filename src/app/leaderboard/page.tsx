import Link from "next/link";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { SearchParams } from "@/lib/flash";
import { classLeaderboard, leaderWindow, PERIODS, schoolLeaderboard, type Period } from "@/lib/gamification/leaderboard";
import PageHead from "@/components/PageHead";
import Avatar from "@/components/Avatar";
import { Leaderboard } from "@/components/Progress";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("leaderboard"))("title") };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period: Period = (PERIODS as readonly string[]).includes(sp.period as string) ? (sp.period as Period) : "week";
  const [t, format] = await Promise.all([getTranslations("leaderboard"), getFormatter()]);

  const me = await db.user.findUnique({ where: { id: user.id }, select: { classId: true } });
  const [students, classes] = await Promise.all([
    schoolLeaderboard(period, user.role === "STUDENT" ? user.id : undefined),
    classLeaderboard(period, me?.classId),
  ]);
  const podium = students.slice(0, 3);
  const isStudent = user.role === "STUDENT";
  const rest = isStudent ? leaderWindow(students, 10) : students.slice(0, 25);
  const maxAvg = Math.max(1, ...classes.map((c) => c.average));

  return (
    <div className="app">
      <PageHead
        title={t.rich("heading", { tint: (c) => <em className="tint">{c}</em> })}
        subtitle={t("subtitle")}
        actions={
          <div className="part-tabs" role="group" aria-label={t("period")} style={{ margin: 0 }}>
            {PERIODS.map((p) => (
              <Link key={p} href={`/leaderboard?period=${p}`} className="part-tab" aria-pressed={p === period} style={{ textDecoration: "none" }}>
                {t(`periods.${p}`)}
              </Link>
            ))}
          </div>
        }
      />

      {podium.length > 0 && (
        <section className="podium intro intro-2">
          {[1, 0, 2].filter((i) => podium[i]).map((i) => {
            const r = podium[i];
            return (
              <div key={r.userId} className={`podium-step glass p${i + 1} ${r.isViewer ? "me" : ""}`}>
                <span className="podium-medal" aria-hidden="true">{MEDALS[i]}</span>
                <Avatar avatar={r.avatar} size={i === 0 ? 84 : 64} level={r.level} />
                <Link href={`/users/${r.userId}`} className="lb-link"><strong>{r.isViewer ? t("you", { name: r.name }) : r.name}</strong></Link>
                {r.className && <span className="muted" style={{ fontSize: 13 }}>{r.className}</span>}
                <span className="podium-xp">{format.number(r.xp)} XP</span>
              </div>
            );
          })}
        </section>
      )}

      <div className="grid-2">
        <section className="panel glass">
          <h2>{t("students", { count: students.length })}</h2>
          <Leaderboard rows={rest} joinHint={isStudent} emptyText={t("emptyStudents")} />
          {!isStudent && students.length > rest.length && (
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{t("topShown", { count: rest.length })}</p>
          )}
        </section>

        <section className="panel glass">
          <h2>{t("classes")}</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{t("classesHint")}</p>
          {classes.length === 0 ? (
            <div className="empty">{t("emptyClasses")}</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {classes.map((c) => (
                <div key={c.id} className={`class-row ${c.isViewer ? "me" : ""}`}>
                  <span className={`lb-rank r${c.rank}`}>{c.rank}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="spread">
                      <strong style={{ fontWeight: 400 }}>
                        {c.name} {c.isViewer && <span className="badge badge-teal">{t("yourClass")}</span>}
                      </strong>
                      <span className="lb-xp">{t("average", { xp: format.number(c.average) })}</span>
                    </div>
                    <div className="meter-track" style={{ height: 6, margin: "6px 0 4px" }}>
                      <i style={{ width: `${(c.average / maxAvg) * 100}%`, background: "linear-gradient(90deg, var(--teal), var(--violet))" }} />
                    </div>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {t("classMeta", { students: c.students, total: format.number(c.total) })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
