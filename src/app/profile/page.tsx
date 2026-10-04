import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseAvatar } from "@/lib/gamification/avatar";
import { BADGE_IDS } from "@/lib/gamification/badges";
import { loadProgress } from "@/lib/gamification/progress";
import { MAX_FREEZES } from "@/lib/gamification/streak";
import type { SearchParams } from "@/lib/flash";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import Avatar from "@/components/Avatar";
import { BadgeIcon, LevelBar, StreakFlame } from "@/components/Progress";
import AvatarEditor from "./AvatarEditor";
import { setLeaderboardVisibility } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("profile"))("metaTitle") };
}

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const [t, tb, tr, tt, format, p] = await Promise.all([
    getTranslations("profile"),
    getTranslations("badges"),
    getTranslations("roles"),
    getTranslations("tiers"),
    getFormatter(),
    loadProgress(me.id),
  ]);
  const isStudent = me.role === "STUDENT";

  const stats = isStudent
    ? await db.attempt.aggregate({
        where: { userId: me.id, completedAt: { not: null } },
        _count: true,
        _sum: { correctCount: true },
      })
    : null;

  return (
    <div className="app">
      <PageHead title={t.rich("title", { tint: (c) => <em className="tint">{c}</em> })} subtitle={`${me.name} · ${tr(me.role)}`} />
      <Flash searchParams={searchParams} />

      {isStudent && (
        <section className="player-card glass intro intro-2">
          <Avatar avatar={p.user.avatar} size={72} level={p.level.level} />
          <div>
            <h2>{tt(p.level.tier)}</h2>
            <LevelBar xp={p.user.xp} />
          </div>
          <div className="player-stats">
            <span className="chip"><StreakFlame streak={p.streak.streak} atRisk={p.streak.atRisk} /></span>
            <span className="chip" title={t("freezeHint")}>
              ❄ {t.rich("freezes", { count: p.user.streakFreezes, max: MAX_FREEZES, b: (c) => <b>{c}</b> })}
            </span>
            <span className="chip">{t.rich("bestStreak", { count: p.user.longestStreak, b: (c) => <b>{c}</b> })}</span>
            <span className="chip">
              {t.rich("totals", { quizzes: stats?._count ?? 0, correct: stats?._sum.correctCount ?? 0, b: (c) => <b>{c}</b> })}
            </span>
          </div>
        </section>
      )}

      <section className="panel glass intro intro-2">
        <h2>{t("avatar")}</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          {t("avatarHint")} {isStudent ? t("avatarHintStudent") : t("avatarHintStaff")}
        </p>
        <AvatarEditor initial={parseAvatar(p.user.avatar)} level={p.level.level} badges={p.badges} everything={p.unlock.everything ?? false} />
      </section>

      {isStudent && (
        <>
          <section className="panel glass">
            <h2>{t("badgesTitle", { count: p.badges.length, total: BADGE_IDS.length })}</h2>
            <div className="badge-grid">
              {BADGE_IDS.map((id) => {
                const earned = p.badgeDates.get(id);
                return (
                  <div key={id} className={`badge-card ${earned ? "" : "locked"}`}>
                    <BadgeIcon id={id} locked={!earned} />
                    <b>{tb(`${id}.name`)}</b>
                    <span className="desc">
                      {earned ? t("earnedOn", { date: format.dateTime(earned, { dateStyle: "medium" }) }) : tb(`${id}.description`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel glass">
            <h2>{t("leaderboards")}</h2>
            <form action={setLeaderboardVisibility} className="spread">
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14 }}>{p.user.showOnLeaderboard ? t("visible") : t("hidden")}</p>
              <input type="hidden" name="show" value={String(!p.user.showOnLeaderboard)} />
              <button className="btn btn-sm" type="submit">{p.user.showOnLeaderboard ? t("hideMe") : t("showMe")}</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
