import { useFormatter, useTranslations } from "next-intl";
import { BADGES, type BadgeId } from "@/lib/gamification/badges";
import { levelInfo } from "@/lib/gamification/levels";
import type { LeaderRow } from "@/lib/gamification/leaderboard";
import Avatar from "./Avatar";

// next-intl's hooks work in both server and client components, so these can be used anywhere.

export function LevelBar({ xp }: { xp: number }) {
  const t = useTranslations("progress");
  const tt = useTranslations("tiers");
  const info = levelInfo(xp);
  return (
    <div className="level-bar">
      <div className="spread" style={{ fontSize: 13 }}>
        <span>
          <strong style={{ color: info.color, fontWeight: 400 }}>{t("level", { level: info.level })}</strong>{" "}
          <span className="muted">· {tt(info.tier)}</span>
        </span>
        <span className="muted">{t("xpOf", { xp: info.intoLevel, needed: info.needed })}</span>
      </div>
      <div className="xp-track" role="progressbar" aria-valuemin={0} aria-valuemax={info.needed} aria-valuenow={info.intoLevel} aria-label={t("toNext")}>
        <i style={{ width: `${info.progress * 100}%` }} />
      </div>
    </div>
  );
}

export function BadgeIcon({ id, locked, size = 48 }: { id: BadgeId; locked?: boolean; size?: number }) {
  const t = useTranslations("badges");
  const b = BADGES[id];
  return (
    <span
      className={`badge-icon ${locked ? "locked" : ""}`}
      style={{ ["--c" as string]: b.color, width: size, height: size, fontSize: size * 0.42 }}
      title={`${t(`${id}.name`)} : ${t(`${id}.description`)}`}
    >
      {b.glyph}
    </span>
  );
}

export function Stars({ count, size = 14 }: { count: number; size?: number }) {
  const t = useTranslations("progress");
  return (
    <span className="stars" aria-label={t("stars", { count })} style={{ fontSize: size }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? "on" : ""}>★</span>
      ))}
    </span>
  );
}

export function StreakFlame({ streak, atRisk }: { streak: number; atRisk?: boolean }) {
  const t = useTranslations("progress");
  return (
    <span className={`streak ${streak > 0 ? "lit" : ""} ${atRisk ? "risk" : ""}`} title={atRisk ? t("streakAtRisk") : undefined}>
      <span aria-hidden="true">♨</span> {t("days", { count: streak })}
    </span>
  );
}

export function Leaderboard({ rows, emptyText, joinHint }: { rows: LeaderRow[]; emptyText: string; joinHint?: boolean }) {
  const t = useTranslations("progress");
  const format = useFormatter();
  if (rows.length === 0) return <div className="empty">{emptyText}</div>;
  const me = rows.find((r) => r.isViewer);
  const above = me && me.rank > 1 ? rows.find((r) => r.rank === me.rank - 1) : undefined;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r, i) => (
        <div key={r.userId}>
          {i > 0 && r.rank - rows[i - 1].rank > 1 && <div className="lb-gap">···</div>}
          <div className={`lb-row ${r.isViewer ? "me" : ""}`}>
            <span className={`lb-rank r${r.rank}`}>{r.rank}</span>
            <Avatar avatar={r.avatar} size={30} level={r.level} />
            <span className="lb-name">
              {r.isViewer ? t("you", { name: r.name }) : r.name}
              {r.className && <span className="muted" style={{ fontSize: 12.5 }}> · {r.className}</span>}
            </span>
            <span className="lb-xp">{format.number(r.xp)} XP</span>
          </div>
        </div>
      ))}
      {above && me && (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          {t("toPass", { xp: above.xp - me.xp + 1, name: above.name.split(" ")[0] })}
        </p>
      )}
      {joinHint && !me && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{t("joinBoard")}</p>}
    </div>
  );
}
