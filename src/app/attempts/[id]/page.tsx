import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { canManageCourse, requireUser } from "@/lib/auth";
import { parseRewards } from "@/lib/gamification/engine";
import PageHead from "@/components/PageHead";
import RewardPanel from "./RewardPanel";
import RichText from "@/components/RichText";
import { mediaUrl } from "@/lib/media";
import {
  inZone,
  parseData,
  parseNumber,
  parseResponse,
  questionType,
  type HotspotResponse,
} from "@/lib/question-types";

type ReviewQuestion = {
  type: string;
  data: string | null;
  imageId: string | null;
  choices: { id: string; text: string; imageId: string | null; order: number; group: number | null }[];
};

/** The student's answer next to the right one, for hotspot, order, categorize and numeric questions. */
async function ReviewOther({ question: q, response }: { question: ReviewQuestion; response: unknown }) {
  const [t, format] = await Promise.all([getTranslations("results"), getFormatter()]);
  const type = questionType(q.type);
  const data = parseData(q.data);
  const byId = new Map(q.choices.map((c) => [c.id, c]));
  const item = (c: ReviewQuestion["choices"][number]) => (
    <>
      {c.imageId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(c.imageId)!} alt="" className="review-choice-image" />
      )}
      <RichText text={c.text} />
    </>
  );
  const indent = { margin: "10px 0 0 40px" };

  if (type === "hotspot") {
    const p = response as HotspotResponse | null;
    const hit = p && typeof p.x === "number" ? (data.zones ?? []).some((z) => inZone(p, z)) : null;
    return (
      <div style={indent}>
        {q.imageId && (
          <div className="hotspot locked review">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(q.imageId)!} alt="" />
            {(data.zones ?? []).map((z, i) => (
              <span key={i} className="hotspot-zone" style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }} />
            ))}
            {hit !== null && <span className={`hotspot-marker ${hit ? "" : "miss"}`} style={{ left: `${p!.x * 100}%`, top: `${p!.y * 100}%` }} />}
          </div>
        )}
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{t("hotspotLegend")}</p>
      </div>
    );
  }

  if (type === "order") {
    const right = [...q.choices].sort((a, b) => a.order - b.order);
    const given = Array.isArray(response) ? (response as string[]).map((id) => byId.get(id)).filter((c) => c !== undefined) : [];
    return (
      <div className="review-columns" style={indent}>
        {given.length > 0 && (
          <div>
            <span className="label">{t("yourOrder")}</span>
            <ol className="q-choices flush">
              {given.map((c, i) => (
                <li key={c.id} className={c.id === right[i]?.id ? "correct" : "wrong"}>{item(c)}</li>
              ))}
            </ol>
          </div>
        )}
        <div>
          <span className="label">{t("rightOrder")}</span>
          <ol className="q-choices flush">
            {right.map((c) => <li key={c.id}>{item(c)}</li>)}
          </ol>
        </div>
      </div>
    );
  }

  if (type === "categorize") {
    const given = response && typeof response === "object" && !Array.isArray(response) ? (response as Record<string, number>) : {};
    const cats = data.categories ?? [];
    return (
      <ul className="q-choices">
        {q.choices.map((c) => {
          const mine = given[c.id];
          const ok = mine === c.group;
          return (
            <li key={c.id} className={ok ? "correct" : undefined}>
              {ok ? "✓ " : "✗ "}
              {item(c)} → <RichText text={cats[c.group ?? -1] ?? "?"} />
              {!ok && mine !== undefined && <span className="muted"> ({t("yourChoice", { category: cats[mine] ?? "?" })})</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  // numeric
  const unit = data.unit ? ` ${data.unit}` : "";
  const typed = typeof response === "string" ? response : null;
  const value = typed !== null ? parseNumber(typed) : null;
  return (
    <ul className="q-choices">
      <li className="correct">
        ✓ {data.answer === undefined ? "?" : format.number(data.answer, { maximumFractionDigits: 6 })}
        {unit}
        {data.tolerance ? ` (± ${format.number(data.tolerance, { maximumFractionDigits: 6 })})` : ""}
      </li>
      {typed !== null && (
        <li>
          {t("yourValue", { value: (value !== null ? format.number(value, { maximumFractionDigits: 6 }) : typed) + unit })}
        </li>
      )}
    </ul>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("results"))("metaTitle") };
}

// Visible to the student who played, and to whoever manages the course.
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [t, tn, format] = await Promise.all([getTranslations("results"), getTranslations("nav"), getFormatter()]);

  const attempt = await db.attempt.findUnique({
    where: { id },
    include: {
      user: { select: { name: true } },
      quiz: {
        include: {
          course: { select: { id: true, code: true } },
          questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } },
        },
      },
      answers: true,
    },
  });
  if (!attempt || !attempt.completedAt) notFound();
  const isOwner = attempt.userId === user.id;
  if (!isOwner && !(await canManageCourse(user, attempt.quiz.courseId))) notFound();

  const rewards = isOwner ? parseRewards(attempt.rewards) : null;
  const byQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const accuracy = attempt.totalQuestions ? attempt.correctCount / attempt.totalQuestions : 0;
  const back = isOwner
    ? { href: "/student", label: tn("myCourses") }
    : { href: `/teacher/quizzes/${attempt.quiz.id}`, label: attempt.quiz.title };

  return (
    <div className="app">
      <PageHead
        title={isOwner ? t.rich("titleOwn", { tint: (c) => <em className="tint">{c}</em> }) : t("titleOther", { name: attempt.user.name })}
        subtitle={`${attempt.quiz.title} · ${attempt.quiz.course.code}`}
        crumbs={[back]}
        actions={isOwner && <Link className="btn btn-bright" href={`/student/quizzes/${attempt.quiz.id}`}>{t("playAgain")}</Link>}
      />

      <div className="grid-cards intro intro-2">
        <div className="stat glass" style={{ ["--c" as string]: "var(--teal)" }}>
          <b>{format.number(attempt.score)}</b>
          <span>{t("points")}</span>
        </div>
        <div className="stat glass" style={{ ["--c" as string]: "var(--lilac)" }}>
          <b>{attempt.correctCount}/{attempt.totalQuestions}</b>
          <span>{t("correct")}</span>
        </div>
        <div className="stat glass" style={{ ["--c" as string]: "var(--rose)" }}>
          <b>{format.number(accuracy, { style: "percent" })}</b>
          <span>{t("accuracy")}</span>
        </div>
      </div>

      {rewards && <RewardPanel r={rewards} />}

      <section className="panel glass">
        <h2>{t("review")}</h2>
        <div className="stack">
          {attempt.quiz.questions.map((q, i) => {
            const a = byQuestion.get(q.id);
            return (
              <div key={q.id} className="q-item">
                <div className="row" style={{ alignItems: "baseline" }}>
                  <span className="q-num">{i + 1}</span>
                  <span style={{ flex: 1, color: "var(--ink)" }}><RichText text={q.prompt} /></span>
                  <span className={`badge ${a?.isCorrect ? "badge-teal" : "badge-rose"}`}>
                    {!a ? t("skipped") : a.isCorrect ? `+${a.points}` : a.choiceId || a.response ? t("wrong") : t("timeUp")}
                  </span>
                </div>
                {q.type !== "choice" ? (
                  <ReviewOther question={q} response={parseResponse(a?.response ?? null)} />
                ) : (
                  <>
                {q.imageId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(q.imageId)!} alt="" className="review-image" />
                )}
                {a && a.claim !== null && (
                  // True-or-false: the student judged one proposed answer.
                  <p style={{ margin: "10px 0 0 40px", fontSize: 14, color: "var(--ink-2)" }}>
                    {t("tfLine", {
                      statement: q.choices.find((c) => c.id === a.choiceId)?.text ?? "?",
                      verdict: a.claim ? t("true") : t("false"),
                    })}
                  </p>
                )}
                <ul className="q-choices">
                  {q.choices.map((c) => {
                    const mine = a?.claim === null && c.id === a?.choiceId;
                    return (
                      <li key={c.id} className={c.isCorrect ? "correct" : undefined}>
                        {c.isCorrect ? "✓ " : mine ? "✗ " : "· "}
                        {c.imageId && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(c.imageId)!} alt="" className="review-choice-image" />
                        )}
                        <RichText text={c.text} />
                        {mine && !c.isCorrect && <span className="muted"> {t("yourAnswer")}</span>}
                      </li>
                    );
                  })}
                </ul>
                  </>
                )}
                {q.wrongFeedback && !a?.isCorrect && (
                  <div className="wrong-feedback" style={{ margin: "10px 0 0 40px" }}>
                    <span className="label">{t("whyWrong")}</span>
                    <p><RichText text={q.wrongFeedback} /></p>
                  </div>
                )}
                {q.explanation && (
                  <p className="muted" style={{ margin: "10px 0 0 40px", fontSize: 14 }}><RichText text={q.explanation} /></p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
