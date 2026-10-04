"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GAME_MODE_KEYS } from "@/lib/game-modes";
import { DIFFICULTIES, DIFFICULTY_KEYS } from "@/lib/difficulty";

export default function ImportQuizForm({ courseId }: { courseId: string }) {
  const t = useTranslations("import");
  const tu = useTranslations("upload");
  const tg = useTranslations("gameModes");
  const td = useTranslations("difficulty");
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
      const res = await fetch(`/api/courses/${courseId}/quizzes/import`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("failed"));
      router.push(`/teacher/quizzes/${data.quizId}`);
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
          accept="application/json,.json"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <strong style={{ fontWeight: 400, color: "var(--ink)" }}>{fileName ?? t("choose")}</strong>
        <span className="muted">{t("limit")}</span>
      </label>
      <div className="form-row">
        <label className="field">
          <span>{tu("mode")}</span>
          <select className="select" name="mode" defaultValue="classic">
            {GAME_MODE_KEYS.map((key) => (
              <option key={key} value={key}>{tg(`${key}.label`)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{tu("difficulty")}</span>
          <select className="select" name="difficulty" defaultValue="medium">
            {DIFFICULTY_KEYS.map((d) => (
              <option key={d} value={d}>{td(`${d}.label`)} · {td("xp", { n: DIFFICULTIES[d].xpMultiplier })}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ gap: 16 }}>
        <label className="check">
          <input type="checkbox" name="shuffleQuestions" />
          {tu("shuffleQuestions")}
        </label>
        <label className="check">
          <input type="checkbox" name="shuffleAnswers" defaultChecked />
          {tu("shuffleAnswers")}
        </label>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {t("help")}{" "}
        <a href="/quiz-import-example.json" download>{t("example")}</a>
      </p>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? t("importing") : t("submit")}
      </button>
    </form>
  );
}
