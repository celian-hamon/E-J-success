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
                    {!a ? t("skipped") : a.isCorrect ? `+${a.points}` : a.choiceId ? t("wrong") : t("timeUp")}
                  </span>
                </div>
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
