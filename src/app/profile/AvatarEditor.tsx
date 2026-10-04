"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AVATAR_PART_KEYS,
  isUnlocked,
  partOptions,
  type AvatarConfig,
  type AvatarPart,
  type Unlock,
} from "@/lib/gamification/avatar";
import { AvatarSvg } from "@/components/Avatar";
import { saveAvatar } from "./actions";

export default function AvatarEditor({
  initial,
  level,
  badges,
  everything,
}: {
  initial: AvatarConfig;
  level: number;
  badges: string[];
  everything: boolean;
}) {
  const t = useTranslations("avatar");
  const tb = useTranslations("badges");
  const [config, setConfig] = useState(initial);
  const [part, setPart] = useState<AvatarPart>("hair");
  const ctx = { level, badges: new Set(badges), everything };
  const options = partOptions(part);
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  const unlockedCount = AVATAR_PART_KEYS.reduce((n, p) => n + partOptions(p).filter((o) => isUnlocked(o, ctx)).length, 0);
  const totalCount = AVATAR_PART_KEYS.reduce((n, p) => n + partOptions(p).length, 0);

  const optionLabel = (p: AvatarPart, id: string) => t(`options.${p}.${id}` as "options.bg.aurora");
  const unlockLabel = (u: Unlock) =>
    u.level ? t("unlockLevel", { level: u.level }) : u.badge ? t("unlockBadge", { badge: tb(`${u.badge}.name`) }) : "";

  function randomize() {
    const next = { ...config };
    for (const p of AVATAR_PART_KEYS) {
      const open = partOptions(p).filter((o) => isUnlocked(o, ctx));
      next[p] = open[Math.floor(Math.random() * open.length)].id;
    }
    setConfig(next);
  }

  return (
    <div className="avatar-editor">
      <div className="avatar-stage">
        <div className="halo-bg">
          <AvatarSvg config={config} size={200} />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("unlockedCount", { n: unlockedCount, total: totalCount })}</p>
        <form action={saveAvatar} className="row" style={{ justifyContent: "center" }}>
          <input type="hidden" name="avatar" value={JSON.stringify(config)} />
          <button type="button" className="btn btn-sm" onClick={randomize}>{t("surprise")}</button>
          <button type="submit" className="btn btn-bright btn-sm" disabled={!dirty}>{t("save")}</button>
        </form>
      </div>

      <div>
        <div className="part-tabs" role="group" aria-label={t("partGroup")}>
          {AVATAR_PART_KEYS.map((p) => (
            <button key={p} type="button" className="part-tab" aria-pressed={p === part} onClick={() => setPart(p)}>
              {t(`parts.${p}`)}
            </button>
          ))}
        </div>
        <div className="option-grid">
          {options.map((o) => {
            const open = isUnlocked(o, ctx);
            const label = optionLabel(part, o.id);
            return (
              <button
                key={o.id}
                type="button"
                className="option"
                aria-pressed={config[part] === o.id}
                disabled={!open}
                onClick={() => setConfig({ ...config, [part]: o.id })}
                title={open ? label : unlockLabel(o.unlock!)}
              >
                {!open && <span className="lock" aria-hidden="true">🔒</span>}
                <AvatarSvg config={{ ...config, [part]: o.id }} size={56} />
                <span>{label}</span>
                {!open && o.unlock && <span className="req">{unlockLabel(o.unlock)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
