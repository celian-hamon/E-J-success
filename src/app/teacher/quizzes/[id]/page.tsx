import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { GAME_MODE_KEYS, MAX_LIVES } from "@/lib/game-modes";
import { DIFFICULTIES, DIFFICULTY_KEYS } from "@/lib/difficulty";
import { mediaUrl } from "@/lib/media";
import RichText from "@/components/RichText";
import { getManagedQuiz } from "@/lib/quiz-access";
import type { SearchParams } from "@/lib/flash";
import PageHead from "@/components/PageHead";
import Flash from "@/components/Flash";
import { deleteQuestion, deleteQuiz, saveQuestion, setPublished, updateQuizSettings } from "../../actions";

const SLOTS = 4; // blank choice inputs shown for a new question (up to 6 are accepted)

type EditableQuestion = {
  id: string;
  prompt: string;
  explanation: string | null;
  wrongFeedback: string | null;
  imageId: string | null;
  choices: { text: string; isCorrect: boolean; imageId: string | null }[];
};

/** Current image (with a "remove" box) plus a file input to add or replace it. */
async function ImageField({ name, removeName, imageId, compact }: { name: string; removeName: string; imageId: string | null; compact?: boolean }) {
  const t = await getTranslations("editor");
  return (
    <div className={`image-field ${compact ? "compact" : ""}`}>
      {imageId && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(imageId)!} alt="" className="image-thumb" />
          <label className="check" style={{ fontSize: 12.5 }}>
            <input type="checkbox" name={removeName} />
            {t("removeImage")}
          </label>
        </>
      )}
      <label className="btn btn-sm image-pick" title={t("imageHint")}>
        🖼 {imageId ? t("replaceImage") : compact ? t("addImageShort") : t("addImage")}
        <input type="file" name={name} accept="image/png,image/jpeg,image/webp,image/gif,image/avif" />
      </label>
    </div>
  );
}

async function QuestionFields({ quizId, question }: { quizId: string; question?: EditableQuestion }) {
  const t = await getTranslations("editor");
  const choices = question?.choices ?? [];
  const count = Math.max(SLOTS, choices.length);
  const correct = choices.findIndex((c) => c.isCorrect);
  const key = question?.id ?? "new";
  return (
    <form className="form" action={saveQuestion} style={{ marginTop: question ? 14 : 0 }}>
      <input type="hidden" name="quizId" value={quizId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      <label className="field">
        <span>{t("question")}</span>
        <textarea className="textarea" name="prompt" defaultValue={question?.prompt} required style={{ minHeight: 64 }} />
        <span className="muted" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }}>{t("latexHint")}</span>
      </label>
      <ImageField name="image" removeName="removeImage" imageId={question?.imageId ?? null} />
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">{t("choices")}</span>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="choice-edit">
            <input type="radio" name="correct" value={i} defaultChecked={i === (correct === -1 ? 0 : correct)} aria-label={t("isCorrect", { n: i + 1 })} />
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input
                className="input"
                name={`choice${i}`}
                defaultValue={choices[i]?.text}
                placeholder={i >= 2 ? t("choiceOptional", { n: i + 1 }) : t("choice", { n: i + 1 })}
                id={`${key}-c${i}`}
              />
              <ImageField name={`choiceImage${i}`} removeName={`removeChoiceImage${i}`} imageId={choices[i]?.imageId ?? null} compact />
            </div>
          </div>
        ))}
      </div>
      <label className="field">
        <span>{t("explanation")}</span>
        <input className="input" name="explanation" defaultValue={question?.explanation ?? ""} />
      </label>
      <label className="field">
        <span>{t("wrongFeedback")}</span>
        <textarea
          className="textarea"
          name="wrongFeedback"
          defaultValue={question?.wrongFeedback ?? ""}
          placeholder={t("wrongFeedbackPlaceholder")}
          style={{ minHeight: 56 }}
        />
      </label>
      <div className="row">
        <button className="btn btn-bright btn-sm" type="submit">{question ? t("save") : t("add")}</button>
      </div>
    </form>
  );
}

type Props = { params: Promise<{ id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quiz = await db.quiz.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: quiz?.title };
}

export default async function QuizEditorPage({ params, searchParams }: Props) {
  const user = await requireRole("TEACHER", "ADMIN");
  const { id } = await params;
  if (!(await getManagedQuiz(user, id))) notFound();
  const [t, tt, tn, tg, td, format] = await Promise.all([
    getTranslations("editor"),
    getTranslations("teacher"),
    getTranslations("nav"),
    getTranslations("gameModes"),
    getTranslations("difficulty"),
    getFormatter(),
  ]);

  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, code: true, title: true } },
      questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } },
      attempts: {
        where: { completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!quiz) notFound();

  return (
    <>
      <PageHead
        title={quiz.title}
        subtitle={
          <>
            <span className={`badge ${quiz.published ? "badge-teal" : ""}`}>{quiz.published ? tt("published") : tt("draft")}</span>{" "}
            {tt("questionCount", { count: quiz.questions.length })}
            {quiz.sourceFileName ? ` · ${tt("fromFile", { file: quiz.sourceFileName })}` : ""}
          </>
        }
        crumbs={[
          { href: "/teacher", label: tn("myCourses") },
          { href: `/teacher/courses/${quiz.course.id}`, label: quiz.course.code },
        ]}
        actions={
          <form action={setPublished}>
            <input type="hidden" name="quizId" value={quiz.id} />
            <input type="hidden" name="published" value={String(!quiz.published)} />
            <button className={`btn ${quiz.published ? "" : "btn-bright"}`} type="submit">
              {quiz.published ? t("unpublish") : t("publish")}
            </button>
          </form>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid-2">
        <div className="stack">
          <section className="panel glass">
            <h2>{t("questions")}</h2>
            {quiz.questions.length === 0 ? (
              <div className="empty">{t("noQuestions")}</div>
            ) : (
              <div className="stack">
                {quiz.questions.map((q, i) => (
                  <details key={q.id} className="q-item">
                    <summary>
                      <span className="q-num">{i + 1}</span>
                      <span style={{ flex: 1 }}><RichText text={q.prompt} /></span>
                      {q.imageId && <span title={t("hasImage")}>🖼</span>}
                    </summary>
                    {q.wrongFeedback && (
                      <p className="muted" style={{ margin: "8px 0 0 40px", fontSize: 13 }}>✎ <RichText text={q.wrongFeedback} /></p>
                    )}
                    <ul className="q-choices">
                      {q.choices.map((c) => (
                        <li key={c.id} className={c.isCorrect ? "correct" : undefined}>
                          {c.isCorrect ? "✓ " : "· "}
                          <RichText text={c.text} />
                          {c.imageId && " 🖼"}
                        </li>
                      ))}
                    </ul>
                    <QuestionFields quizId={quiz.id} question={q} />
                    <form action={deleteQuestion} style={{ marginTop: 10 }}>
                      <input type="hidden" name="quizId" value={quiz.id} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <button className="btn btn-sm btn-danger" type="submit">{t("deleteQuestion")}</button>
                    </form>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="panel glass">
            <h2>{t("addQuestion")}</h2>
            <QuestionFields quizId={quiz.id} />
          </section>
        </div>

        <div className="stack">
          <section className="panel glass">
            <h2>{t("settings")}</h2>
            <form className="form" action={updateQuizSettings}>
              <input type="hidden" name="quizId" value={quiz.id} />
              <label className="field">
                <span>{t("title")}</span>
                <input className="input" name="title" defaultValue={quiz.title} required />
              </label>
              <label className="field">
                <span>{t("description")}</span>
                <textarea className="textarea" name="description" defaultValue={quiz.description ?? ""} />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>{t("mode")}</span>
                  <select className="select" name="mode" defaultValue={quiz.mode}>
                    {GAME_MODE_KEYS.map((k) => (
                      <option key={k} value={k}>{tg(`${k}.label`)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("seconds")}</span>
                  <input className="input" name="secondsPerQuestion" type="number" min={5} max={300} defaultValue={quiz.secondsPerQuestion} />
                </label>
              </div>
              <details>
                <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>{t("modesHelp")}</summary>
                <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, display: "grid", gap: 4 }}>
                  {GAME_MODE_KEYS.map((k) => (
                    <li key={k}><strong style={{ fontWeight: 400, color: "var(--ink-2)" }}>{tg(`${k}.label`)}</strong> : {tg(`${k}.description`)}</li>
                  ))}
                </ul>
              </details>
              <label className="field">
                <span>{t("difficulty")}</span>
                <select className="select" name="difficulty" defaultValue={quiz.difficulty}>
                  {DIFFICULTY_KEYS.map((d) => (
                    <option key={d} value={d}>{td(`${d}.label`)} · {t("xpTimes", { n: DIFFICULTIES[d].xpMultiplier })}</option>
                  ))}
                </select>
              </label>
              <span className="label">{t("options")}</span>
              <label className="check">
                <input type="checkbox" name="combo" defaultChecked={quiz.combo} />
                <span>
                  {t("combo")} <span className="muted">· {t("comboHint")}</span>
                </span>
              </label>
              <div className="row" style={{ gap: 10 }}>
                <label className="check">
                  <input type="checkbox" name="survival" defaultChecked={quiz.lives !== null} />
                  <span>
                    {t("survival")} <span className="muted">· {t("survivalHint")}</span>
                  </span>
                </label>
                <label className="row" style={{ gap: 6, fontSize: 14, color: "var(--ink-2)" }}>
                  <input className="input" type="number" name="lives" min={1} max={MAX_LIVES} defaultValue={quiz.lives ?? 3} style={{ width: 72, padding: "6px 10px" }} />
                  {t("livesUnit")}
                </label>
              </div>
              <label className="check">
                <input type="checkbox" name="shuffleQuestions" defaultChecked={quiz.shuffleQuestions} />
                {t("shuffleQuestions")}
              </label>
              <label className="check">
                <input type="checkbox" name="shuffleAnswers" defaultChecked={quiz.shuffleAnswers} />
                {t("shuffleAnswers")}
              </label>
              <button className="btn" type="submit">{t("saveSettings")}</button>
            </form>
          </section>

          <section className="panel glass">
            <h2>{t("results")}</h2>
            {quiz.attempts.length === 0 ? (
              <div className="empty">{t("noResults")}</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("student")}</th>
                      <th>{t("correct")}</th>
                      <th>{t("score")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quiz.attempts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/attempts/${a.id}`}><strong>{a.user.name}</strong></Link>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {a.completedAt && format.dateTime(a.completedAt, { dateStyle: "short", timeStyle: "short" })}
                          </div>
                        </td>
                        <td>{a.correctCount}/{a.totalQuestions}</td>
                        <td>{format.number(a.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <form action={deleteQuiz}>
            <input type="hidden" name="quizId" value={quiz.id} />
            <button className="btn btn-sm btn-danger" type="submit">{t("deleteQuiz")}</button>
          </form>
        </div>
      </div>
    </>
  );
}
