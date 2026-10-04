"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GAME_MODE_KEYS, MAX_LIVES } from "@/lib/game-modes";
import { DIFFICULTIES, DIFFICULTY_KEYS } from "@/lib/difficulty";

export default function UploadQuizForm({ courseId, aiEnabled }: { courseId: string; aiEnabled: boolean }) {
  const t = useTranslations("upload");
  const tg = useTranslations("gameModes");
  const td = useTranslations("difficulty");
  const te = useTranslations("editor");
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) return setError(t("offline"));
    setPending(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/quizzes`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("failed"));
      const note = data.warning ? `?error=${encodeURIComponent(data.warning)}` : "";
      router.push(`/teacher/quizzes/${data.quizId}${note}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
      setPending(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <label className="file-drop">
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <strong style={{ fontWeight: 400, color: "var(--ink)" }}>{fileName ?? t("choose")}</strong>
        <span className="muted">{t("limit")}</span>
      </label>
      <div className="form-row">
        <label className="field">
          <span>{t("questions")}</span>
          <input className="input" name="questionCount" type="number" min={3} max={30} defaultValue={10} disabled={!aiEnabled} />
        </label>
        <label className="field">
          <span>{t("mode")}</span>
          <select className="select" name="mode" defaultValue="classic">
            {GAME_MODE_KEYS.map((key) => (
              <option key={key} value={key}>{tg(`${key}.label`)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>{t("difficulty")}</span>
        <select className="select" name="difficulty" defaultValue="medium">
          {DIFFICULTY_KEYS.map((d) => (
            <option key={d} value={d}>{td(`${d}.label`)} · {td("xp", { n: DIFFICULTIES[d].xpMultiplier })}</option>
          ))}
        </select>
      </label>
      <div className="row" style={{ gap: 16 }}>
        <label className="check">
          <input type="checkbox" name="combo" />
          {te("combo")}
        </label>
        <label className="check">
          <input type="checkbox" name="survival" />
          {te("survival")}
        </label>
        <label className="row" style={{ gap: 6, fontSize: 14, color: "var(--ink-2)" }}>
          <input className="input" type="number" name="lives" min={1} max={MAX_LIVES} defaultValue={3} style={{ width: 64, padding: "6px 10px" }} />
          {te("livesUnit")}
        </label>
        <label className="check">
          <input type="checkbox" name="shuffleQuestions" />
          {t("shuffleQuestions")}
        </label>
        <label className="check">
          <input type="checkbox" name="shuffleAnswers" defaultChecked />
          {t("shuffleAnswers")}
        </label>
      </div>
      <label className="field">
        <span>{t("focus")}</span>
        <input className="input" name="focus" placeholder={t("focusPlaceholder")} disabled={!aiEnabled} />
      </label>
      {!aiEnabled && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("aiOff")}</p>}
      <button className="btn btn-bright" type="submit" disabled={pending}>
        {pending ? (aiEnabled ? t("generating") : t("uploading")) : aiEnabled ? t("generate") : t("upload")}
      </button>
    </form>
  );
}
