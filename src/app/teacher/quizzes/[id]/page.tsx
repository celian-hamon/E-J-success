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
import {
  MAX_CATEGORIES,
  MAX_CHOICES,
  MAX_ITEMS,
  MAX_ZONES,
  parseData,
  QUESTION_TYPES,
  questionType,
} from "@/lib/question-types";
import { deleteQuestion, deleteQuiz, saveQuestion, setPublished, updateQuizSettings } from "../../actions";
import ZoneEditor from "./ZoneEditor";
import ConfirmButton from "@/components/ConfirmButton";

const SLOTS = 4; // blank choice inputs shown for a new question (up to 6 are accepted)

type EditableQuestion = {
  id: string;
  type: string;
  data: string | null;
  prompt: string;
  explanation: string | null;
  wrongFeedback: string | null;
  imageId: string | null;
  choices: { text: string; isCorrect: boolean; imageId: string | null; group: number | null }[];
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

// Fields that only apply to some question types carry data-for="<types>"; CSS in globals.css
// hides them unless the form's type select matches, so the form works without extra JS.
async function QuestionFields({ quizId, question }: { quizId: string; question?: EditableQuestion }) {
  const [t, tq] = await Promise.all([getTranslations("editor"), getTranslations("questionTypes")]);
  const type = questionType(question?.type ?? "choice");
  const data = parseData(question?.data);
  const choices = question?.choices ?? [];
  const base = Math.max(SLOTS, Math.min(MAX_CHOICES, choices.length)); // slots shown for multiple choice
  const count = Math.max(MAX_ITEMS, choices.length); // order / categorize show more
  const correct = choices.findIndex((c) => c.isCorrect);
  const key = question?.id ?? "new";
  return (
    <form className="form q-form" action={saveQuestion} style={{ marginTop: question ? 14 : 0 }}>
      <input type="hidden" name="quizId" value={quizId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      <label className="field">
        <span>{t("questionType")}</span>
        <select className="select" name="type" defaultValue={type}>
          {QUESTION_TYPES.map((k) => (
            <option key={k} value={k}>{tq(`${k}.label`)}</option>
          ))}
        </select>
        {QUESTION_TYPES.map((k) => (
          <span key={k} data-for={k} className="muted" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }}>{tq(`${k}.help`)}</span>
        ))}
      </label>
      <label className="field">
        <span>{t("question")}</span>
        <textarea className="textarea" name="prompt" defaultValue={question?.prompt} required style={{ minHeight: 64 }} />
        <span className="muted" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }}>{t("latexHint")}</span>
      </label>
      <ImageField name="image" removeName="removeImage" imageId={question?.imageId ?? null} />

      <div className="stack" data-for="hotspot" style={{ gap: 8 }}>
        <span className="label">{t("zones")}</span>
        <ZoneEditor imageUrl={mediaUrl(question?.imageId)} initialZones={data.zones ?? []} />
      </div>

      <div className="form-row" data-for="numeric">
        <label className="field">
          <span>{t("numericAnswer")}</span>
          <input className="input" name="answer" inputMode="decimal" defaultValue={data.answer ?? ""} placeholder="37 674" />
        </label>
        <label className="field">
          <span>{t("numericTolerance")}</span>
          <input className="input" name="tolerance" inputMode="decimal" defaultValue={data.tolerance ?? ""} placeholder="0" />
        </label>
        <label className="field">
          <span>{t("numericUnit")}</span>
          <input className="input" name="unit" defaultValue={data.unit ?? ""} placeholder="J" />
        </label>
      </div>

      <div className="stack" data-for="choice order categorize" style={{ gap: 8 }}>
        <span className="label" data-for="choice">{t("choices")}</span>
        <span className="label" data-for="order">{t("orderItems")}</span>
        <span className="label" data-for="categorize">{t("categories")}</span>
        <div className="form-row" data-for="categorize">
          {Array.from({ length: MAX_CATEGORIES }, (_, g) => (
            <input
              key={g}
              className="input"
              name={`category${g}`}
              defaultValue={data.categories?.[g] ?? ""}
              placeholder={g < 2 ? t("categoryN", { n: g + 1 }) : t("categoryOptional", { n: g + 1 })}
            />
          ))}
        </div>
        <span className="label" data-for="categorize">{t("categorizeItems")}</span>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="choice-edit" data-for={i < base ? "choice order categorize" : "order categorize"}>
            <span className="choice-lead">
              <input
                type="radio"
                name="correct"
                value={i}
                defaultChecked={i === (correct === -1 ? 0 : correct)}
                aria-label={t("isCorrect", { n: i + 1 })}
                data-for="choice"
              />
              <span className="order-num" data-for="order">{i + 1}</span>
              <select className="select select-sm" name={`group${i}`} defaultValue={choices[i]?.group ?? ""} data-for="categorize" aria-label={t("itemCategory", { n: i + 1 })}>
                <option value="">—</option>
                {Array.from({ length: MAX_CATEGORIES }, (_, g) => (
                  <option key={g} value={g}>{t("categoryShort", { n: g + 1 })}</option>
                ))}
              </select>
            </span>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input
                className="input"
                name={`choice${i}`}
                defaultValue={choices[i]?.text}
                placeholder={i >= 2 ? t("choiceOptional", { n: i + 1 }) : t("choice", { n: i + 1 })}
                aria-label={t("choice", { n: i + 1 })}
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

/** The right answer of a question, as shown in the editor's list. */
function AnswerSummary({
  question: q,
  format,
  t,
}: {
  question: Omit<EditableQuestion, "choices"> & { choices: (EditableQuestion["choices"][number] & { id: string; order: number })[] };
  format: Awaited<ReturnType<typeof getFormatter>>;
  t: Awaited<ReturnType<typeof getTranslations<"editor">>>;
}) {
  const type = questionType(q.type);
  const data = parseData(q.data);
  const label = (c: { text: string; imageId: string | null }) => (
    <>
      <RichText text={c.text} />
      {c.imageId && " 🖼"}
    </>
  );
  if (type === "numeric") {
    return (
      <p className="q-choices correct-line">
        = {data.answer === undefined ? "?" : format.number(data.answer, { maximumFractionDigits: 6 })}
        {data.unit ? ` ${data.unit}` : ""}
        {data.tolerance ? ` (± ${format.number(data.tolerance, { maximumFractionDigits: 6 })})` : ""}
      </p>
    );
  }
  if (type === "hotspot") {
    return <p className="q-choices correct-line">{t("zonesSummary", { count: data.zones?.length ?? 0 })}</p>;
  }
  if (type === "order") {
    return (
      <ol className="q-choices">
        {[...q.choices].sort((a, b) => a.order - b.order).map((c) => <li key={c.id}>{label(c)}</li>)}
      </ol>
    );
  }
  if (type === "categorize") {
    return (
      <ul className="q-choices">
        {(data.categories ?? []).map((cat, g) => (
          <li key={g}>
            <strong style={{ fontWeight: 400, color: "var(--ink-2)" }}><RichText text={cat} /></strong> :{" "}
            {q.choices.filter((c) => c.group === g).map((c, j) => (
              <span key={c.id}>{j > 0 && ", "}{label(c)}</span>
            ))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="q-choices">
      {q.choices.map((c) => (
        <li key={c.id} className={c.isCorrect ? "correct" : undefined}>
          {c.isCorrect ? "✓ " : "· "}
          {label(c)}
        </li>
      ))}
    </ul>
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
  const [t, tt, tn, tg, td, tq, format] = await Promise.all([
    getTranslations("editor"),
    getTranslations("teacher"),
    getTranslations("nav"),
    getTranslations("gameModes"),
    getTranslations("difficulty"),
    getTranslations("questionTypes"),
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
                      <span className="q-title"><RichText text={q.prompt} /></span>
                      {q.type !== "choice" && <span className="badge badge-violet">{tq(`${questionType(q.type)}.label`)}</span>}
                      {q.imageId && <span title={t("hasImage")}>🖼</span>}
                    </summary>
                    {q.wrongFeedback && (
                      <p className="muted" style={{ margin: "8px 0 0 40px", fontSize: 13 }}>✎ <RichText text={q.wrongFeedback} /></p>
                    )}
                    <AnswerSummary question={q} format={format} t={t} />

                    <QuestionFields quizId={quiz.id} question={q} />
                    <form action={deleteQuestion} style={{ marginTop: 10 }}>
                      <input type="hidden" name="quizId" value={quiz.id} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <ConfirmButton className="btn btn-sm btn-danger" message={t("confirmDeleteQuestion", { n: i + 1 })}>
                        {t("deleteQuestion")}
                      </ConfirmButton>
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
            <ConfirmButton className="btn btn-sm btn-danger" message={t("confirmDeleteQuiz", { title: quiz.title, count: quiz.attempts.length })}>
              {t("deleteQuiz")}
            </ConfirmButton>
          </form>
        </div>
      </div>
    </>
  );
}
