import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RewardSummary } from "@/lib/gamification/engine";
import { levelInfo } from "@/lib/gamification/levels";
import { BadgeIcon, LevelBar, Stars, StreakFlame } from "@/components/Progress";

export default function RewardPanel({ r }: { r: RewardSummary }) {
  const t = useTranslations("rewards");
  const tb = useTranslations("badges");
  const ta = useTranslations("avatar");
  const tt = useTranslations("tiers");
  const leveledUp = r.levelAfter > r.levelBefore;
  const after = levelInfo(r.xpAfter);
  return (
    <section className="panel glass intro intro-2">
      <div className="reward">
        <div>
          <h2 className="panel-title">{t("earned")}</h2>
          <div className="reward-xp">
            <span className="tint">+{r.xpGained}</span> <span style={{ fontSize: "0.4em" }} className="muted">XP</span>
          </div>
          <ul className="reward-lines">
            {r.lines.map((l) => (
              <li key={l.key}>
                <span>{t(`lines.${l.key}`, { n: l.n ?? 0 })}</span>
                <b>+{l.xp}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="stack" style={{ alignContent: "start", gap: 16 }}>
          <LevelBar xp={r.xpAfter} />
          {leveledUp && (
            <div className="level-up">
              <span className="badge-icon" style={{ ["--c" as string]: after.color, width: 52, height: 52, fontSize: 22 }}>
                {r.levelAfter}
              </span>
              <div>
                <strong>{t("levelUp", { level: r.levelAfter })}</strong>
                <span className="muted" style={{ fontSize: 13 }}>{t("tier", { tier: tt(after.tier) })}</span>
              </div>
            </div>
          )}
          <div className="row">
            <span className="chip">
              <Stars count={r.stars} />
              {r.stars > r.bestStarsBefore && r.bestStarsBefore > 0 ? t("newBest") : t("stars", { count: r.stars })}
            </span>
            <span className="chip"><StreakFlame streak={r.streak} /></span>
            {r.freezeUsed && <span className="chip">❄ {t("freezeUsed")}</span>}
            {r.freezeEarned && <span className="chip">❄ {t("freezeEarned")}</span>}
          </div>

          {r.mealEarned && (
            <Link href="/student/pet" className="level-up" style={{ textDecoration: "none" }}>
              <span style={{ fontSize: 30 }} aria-hidden="true">🍎</span>
              <div>
                <strong>{t("mealEarned")}</strong>
                <span className="muted" style={{ fontSize: 13 }}>{t("mealEarnedHint")}</span>
              </div>
            </Link>
          )}

          {r.newBadges.length > 0 && (
            <div>
              <p className="label" style={{ margin: "0 0 8px" }}>{t("newBadges", { count: r.newBadges.length })}</p>
              <div className="row">
                {r.newBadges.map((id) => (
                  <span key={id} className="chip" style={{ padding: "6px 14px 6px 6px" }}>
                    <BadgeIcon id={id} size={32} />
                    <b>{tb(`${id}.name`)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.newUnlocks.length > 0 && (
            <div>
              <p className="label" style={{ margin: "0 0 8px" }}>{t("unlocks")}</p>
              <div className="unlock-list">
                {r.newUnlocks.map((u) => (
                  <span key={`${u.part}-${u.id}`} className="badge badge-violet">
                    {ta(`parts.${u.part}`)} : {ta(`options.${u.part}.${u.id}` as "options.bg.aurora")}
                  </span>
                ))}
              </div>
              <Link href="/profile" className="btn btn-sm" style={{ marginTop: 10 }}>{t("customize")}</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
