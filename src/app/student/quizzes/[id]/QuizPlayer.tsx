"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { finishAttempt, startAttempt, submitAnswer, type AnswerResult } from "@/app/student/actions";
import { previewAnswer } from "@/app/teacher/actions";
import type { GameMode, PlayConfig } from "@/lib/game-modes";
import { queueRun, type OfflineAnswer } from "@/lib/offline/outbox";
import { isDifficulty } from "@/lib/difficulty";
import RichText from "@/components/RichText";
import type { AnswerResponse, QuestionType } from "@/lib/question-types";
import { CategorizeInput, HotspotInput, NumericInput, OrderInput } from "./QuestionInputs";

export type PlayerQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  image: string | null;
  choices: { id: string; text: string; image: string | null }[]; // answers, or items to order / sort
  statement?: { choiceId: string; text: string; image: string | null }; // true-or-false mode
  categories?: string[]; // categorize
  unit?: string | null; // numeric
};

const INPUTS = { hotspot: HotspotInput, order: OrderInput, categorize: CategorizeInput, numeric: NumericInput };

/** A quiz image; clicking it toggles a larger view. */
function QuizImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${className ?? "quiz-image"} ${zoom ? "zoomed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setZoom((z) => !z);
      }}
      loading="eager"
    />
  );
}

export type PlayerQuiz = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  mode: GameMode;
  config: PlayConfig; // mode + options (combo, survival)
  secondsPerQuestion: number;
  globalSeconds: number | null; // blitz
  difficulty: string;
  questions: PlayerQuestion[];
};

type Phase = "intro" | "question" | "feedback" | "finishing" | "queued" | "mockDone";
const KEYS = ["A", "B", "C", "D", "E", "F"];

function isNetworkError(err: unknown) {
  return !navigator.onLine || (err instanceof TypeError && /fetch|network/i.test(err.message));
}

// A flaky connection can hang for a long time before failing; give up quickly and play offline.
function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new TypeError("network timeout")), ms))]);
}

/**
 * `mock`: staff test mode. Same game and grading, but nothing is stored (no attempt, XP,
 * badges or pet meal) and the run ends on a summary instead of the results page.
 */
export default function QuizPlayer({ quiz, mock }: { quiz: PlayerQuiz; mock?: { exitHref: string } }) {
  const t = useTranslations("player");
  const tg = useTranslations("gameModes");
  const td = useTranslations("difficulty");
  const router = useRouter();
  const cfg = quiz.config;

  const [phase, setPhase] = useState<Phase>("intro");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  // Offline mode: answers are kept on the device and graded when the run syncs.
  const [offline, setOffline] = useState(false);
  const offlineAnswers = useRef<OfflineAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [claim, setClaim] = useState<boolean | null>(null);
  const [responded, setResponded] = useState(false); // other question types: an answer was sent
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState<number | null>(cfg.lives ?? null);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [remaining, setRemaining] = useState(quiz.secondsPerQuestion * 1000);
  const [globalLeft, setGlobalLeft] = useState((quiz.globalSeconds ?? 0) * 1000);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);
  const globalStart = useRef(0);
  const answering = useRef(false);
  const ending = useRef(false);
  const startedAt = useRef(new Date().toISOString());
  const tally = useRef({ correct: 0, wrong: 0, answered: 0 }); // test mode keeps the run here

  const question = quiz.questions[index];
  const limitMs = quiz.secondsPerQuestion * 1000;
  const globalMs = (quiz.globalSeconds ?? 0) * 1000;
  const isLast = index === quiz.questions.length - 1;

  async function begin() {
    setError(null);
    startedAt.current = new Date().toISOString();
    globalStart.current = performance.now();
    if (mock) return showQuestion(0); // no attempt on the server
    if (!navigator.onLine) {
      setOffline(true);
      return showQuestion(0);
    }
    try {
      const { attemptId } = await withTimeout(startAttempt(quiz.id));
      setAttemptId(attemptId);
      globalStart.current = performance.now();
      showQuestion(0);
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
        showQuestion(0);
      } else {
        setError(t("errors.start"));
      }
    }
  }

  function showQuestion(i: number) {
    setIndex(i);
    setPicked(null);
    setClaim(null);
    setResponded(false);
    setResult(null);
    setRemaining(limitMs);
    shownAt.current = performance.now();
    answering.current = false;
    setPhase("question");
  }

  const endGame = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    if (mock) return setPhase("mockDone");
    setPhase("finishing");
    const queue = (answers: OfflineAnswer[]) =>
      queueRun({
        clientId: crypto.randomUUID(),
        userId: quiz.userId,
        quizId: quiz.id,
        quizTitle: quiz.title,
        attemptId,
        playedAt: startedAt.current,
        answers,
      });

    if (offline || !attemptId) {
      await queue(offlineAnswers.current);
      window.dispatchEvent(new Event("ejs:sync"));
      return setPhase("queued");
    }
    try {
      await finishAttempt(attemptId);
      router.push(`/attempts/${attemptId}`);
    } catch (err) {
      if (isNetworkError(err)) {
        // Every answer is already graded on the server; only the "finish" call is missing.
        await queue([]);
        setPhase("queued");
      } else {
        setError(t("errors.save"));
      }
    }
  }, [attemptId, offline, quiz, router, t, mock]);

  const next = useCallback(() => {
    if (gameOver || isLast) return endGame();
    showQuestion(index + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, isLast, index, endGame]);

  const answer = useCallback(
    async (choiceId: string | null, verdict: boolean | null = null, response: AnswerResponse | null = null) => {
      if (answering.current || phase !== "question") return;
      answering.current = true;
      setPicked(choiceId);
      setClaim(verdict);
      setResponded(response !== null);
      const timeMs = performance.now() - shownAt.current;
      // True-or-false sends the proposed answer plus the verdict; a timeout sends nothing.
      const trueFalse = cfg.trueFalse && question.type === "choice";
      const sentChoice = trueFalse ? (verdict === null ? null : question.statement?.choiceId ?? null) : choiceId;

      const keepOffline = () => {
        offlineAnswers.current.push({ questionId: question.id, choiceId: sentChoice, timeMs, claim: verdict, response });
        setResult(null);
        setPhase("feedback");
      };

      if (!mock && (offline || !attemptId)) return keepOffline();
      try {
        const res = mock
          ? await previewAnswer({
              quizId: quiz.id,
              questionId: question.id,
              choiceId: sentChoice,
              timeMs,
              claim: verdict,
              response,
              streakBefore: streak,
              wrongSoFar: tally.current.wrong,
            })
          : await submitAnswer({ attemptId: attemptId!, questionId: question.id, choiceId: sentChoice, timeMs, claim: verdict, response });
        tally.current.answered++;
        if (res.correct) tally.current.correct++;
        else tally.current.wrong++;
        setResult(res);
        setScore((s) => s + res.points);
        setStreak((s) => (res.correct ? s + 1 : 0));
        if (res.livesLeft !== undefined) setLives(res.livesLeft);
        if (res.gameOver) setGameOver(true);
        setPhase("feedback");
      } catch (err) {
        if (isNetworkError(err) && !mock) {
          setOffline(true);
          keepOffline();
        } else {
          setError(t("errors.answer"));
        }
      }
    },
    [attemptId, offline, question, t, cfg.trueFalse, phase, mock, quiz.id, streak],
  );

  // Per-question countdown (timed, combo); running out submits "no answer".
  useEffect(() => {
    if (phase !== "question" || cfg.timer !== "question") return;
    const timer = setInterval(() => {
      const left = Math.max(0, limitMs - (performance.now() - shownAt.current));
      setRemaining(left);
      if (left === 0) answer(null);
    }, 200);
    return () => clearInterval(timer);
  }, [phase, cfg.timer, limitMs, answer]);

  // One clock for the whole game (blitz); when it runs out, the game ends.
  useEffect(() => {
    if (cfg.timer !== "global" || (phase !== "question" && phase !== "feedback")) return;
    const timer = setInterval(() => {
      const left = Math.max(0, globalMs - (performance.now() - globalStart.current));
      setGlobalLeft(left);
      if (left === 0) endGame();
    }, 200);
    return () => clearInterval(timer);
  }, [phase, cfg.timer, globalMs, endGame]);

  // Blitz keeps the pace: no pause between questions.
  useEffect(() => {
    if (cfg.timer !== "global" || phase !== "feedback") return;
    const timer = setTimeout(next, 650);
    return () => clearTimeout(timer);
  }, [phase, cfg.timer, next]);

  // Keyboard: A–F / 1–6 to answer (V/F or T/F in true-or-false), Enter for next.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === "question" && question) {
        if (question.type !== "choice") return; // their inputs handle the keyboard
        const k = e.key.toUpperCase();
        if (cfg.trueFalse) {
          if (k === "V" || k === "T" || k === "1") answer(null, true);
          if (k === "F" || k === "2") answer(null, false);
          return;
        }
        const i = KEYS.indexOf(k) !== -1 ? KEYS.indexOf(k) : Number(k) - 1;
        if (i >= 0 && i < question.choices.length) answer(question.choices[i].id);
      } else if (phase === "feedback" && e.key === "Enter" && cfg.timer !== "global") {
        next();
      }
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  if (quiz.questions.length === 0) {
    return <div className="player glass empty">{t("noQuestions")}</div>;
  }

  if (phase === "intro") {
    return (
      <section className="player glass intro">
        <p className="eyebrow">
          {tg(`${quiz.mode}.label`)} · {td(`${(isDifficulty(quiz.difficulty) ? quiz.difficulty : "medium")}.label`)}
          {cfg.combo && ` · ${t("optionCombo")}`}
          {cfg.lives && ` · ${t("optionSurvival", { count: cfg.lives })}`}
        </p>
        <h2 className="prompt">{quiz.description ?? t("ready")}</h2>
        <p className="lede">
          {t("intro", { count: quiz.questions.length })} {tg(`${quiz.mode}.description`)}
          {cfg.timer === "question" && ` ${t("timedIntro", { seconds: quiz.secondsPerQuestion })}`}
          {cfg.timer === "global" && ` ${t("blitzIntro", { seconds: quiz.globalSeconds ?? 0 })}`}
          {cfg.lives && ` ${t("livesIntro", { count: cfg.lives })}`}
          {cfg.combo && ` ${t("comboIntro")}`}
        </p>
        {mock && <div className="alert mock-note" style={{ marginBottom: 16 }}>🧪 {t("mockIntro")}</div>}
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <button className="btn btn-bright" onClick={begin}>{mock ? t("mockStart") : t("start")}</button>
      </section>
    );
  }

  if (phase === "mockDone" && mock) {
    const { correct, answered } = tally.current;
    return (
      <section className="player glass intro" style={{ textAlign: "center" }}>
        <p className="eyebrow" style={{ justifyContent: "center" }}>🧪 {t("mockBadge")}</p>
        <div className="score-big">{score}</div>
        <p className="lede">
          {t("mockSummary", { correct, total: quiz.questions.length, answered })}
        </p>
        <p className="muted" style={{ fontSize: 14 }}>{t("mockNothingSaved")}</p>
        <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 18 }}>
          {/* A reload reshuffles the questions like a new game. */}
          <button className="btn btn-bright" onClick={() => window.location.reload()}>{t("mockAgain")}</button>
          <Link className="btn" href={mock.exitHref}>{t("mockExit")}</Link>
        </div>
      </section>
    );
  }

  if (phase === "queued") {
    return (
      <section className="player glass intro" style={{ textAlign: "center" }}>
        <p className="eyebrow" style={{ justifyContent: "center" }}>{t("queuedEyebrow")}</p>
        <h2 className="prompt">{t("queuedTitle")}</h2>
        <p className="lede">{t("queuedText")}</p>
        <Link className="btn btn-bright" href="/student">{t("backHome")}</Link>
      </section>
    );
  }

  const low = cfg.timer === "question" && remaining < limitMs * 0.25;
  const globalLow = cfg.timer === "global" && globalLeft < globalMs * 0.2;
  const correctText = result?.correctChoiceId ? question.choices.find((c) => c.id === result.correctChoiceId)?.text : undefined;

  return (
    <section className="player glass">
      <div className="player-top">
        <span>{t("progress", { n: index + 1, total: quiz.questions.length })}</span>
        <span className="row" style={{ gap: 10 }}>
          {cfg.timer === "question" && phase === "question" && <span className={`timer ${low ? "low" : ""}`}>{Math.ceil(remaining / 1000)}s</span>}
          {cfg.timer === "global" && <span className={`timer ${globalLow ? "low" : ""}`}>⏱ {Math.ceil(globalLeft / 1000)}s</span>}
          {lives !== null && !offline && (
            <span className="lives" aria-label={t("livesLeft", { count: lives })}>
              {Array.from({ length: cfg.lives ?? 0 }, (_, i) => (
                <span key={i} className={i < lives ? "on" : ""}>♥</span>
              ))}
            </span>
          )}
          {cfg.combo && !offline && streak > 1 && <span className="badge badge-violet">{t("comboStreak", { count: streak })}</span>}
        </span>
        <span className="row" style={{ gap: 8 }}>
          {mock && <span className="badge badge-violet">🧪 {t("mockBadge")}</span>}
          {offline ? <span className="badge badge-rose">{t("offlineBadge")}</span> : t("points", { score })}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${((index + (phase === "question" ? 0 : 1)) / quiz.questions.length) * 100}%` }} />
      </div>
      {cfg.timer === "question" && (
        <div className={`timer-bar ${low ? "low" : ""}`} aria-hidden="true">
          <i style={{ width: `${phase === "question" ? (remaining / limitMs) * 100 : 0}%` }} />
        </div>
      )}
      {cfg.timer === "global" && (
        <div className={`timer-bar ${globalLow ? "low" : ""}`} aria-hidden="true">
          <i style={{ width: `${(globalLeft / globalMs) * 100}%` }} />
        </div>
      )}

      <h2 className="prompt"><RichText text={question.prompt} /></h2>
      {/* A hotspot question is answered on its image, so the input shows it. */}
      {question.image && question.type !== "hotspot" && <QuizImage key={question.id} src={question.image} alt={t("questionImage")} />}

      {question.type !== "choice" ? (
        (() => {
          const Input = INPUTS[question.type];
          return (
            <Input
              key={question.id}
              question={question}
              locked={phase !== "question"}
              solution={result?.solution}
              onSubmit={(r) => answer(null, null, r)}
            />
          );
        })()
      ) : cfg.trueFalse && question.statement ? (
        <>
          <div className={`statement ${result ? (result.correct ? "correct" : "wrong") : ""}`}>
            <span className="label">{t("proposed")}</span>
            {question.statement.image && <QuizImage src={question.statement.image} alt={t("answerImage")} className="choice-image" />}
            <strong><RichText text={question.statement.text} /></strong>
          </div>
          <div className="answers tf">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                className={`answer ${phase !== "question" ? (claim === v ? "picked" : "dim") : ""}`}
                disabled={phase !== "question"}
                onClick={() => answer(null, v)}
              >
                <span className="key">{v ? "V" : "F"}</span>
                {v ? t("true") : t("false")}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={`answers ${question.choices.some((c) => c.image) ? "with-images" : ""}`}>
          {question.choices.map((c, i) => {
            let cls = "answer";
            if (result) {
              if (c.id === result.correctChoiceId) cls += " correct";
              else if (c.id === picked) cls += " wrong";
              else cls += " dim";
            } else if (phase !== "question") {
              cls += c.id === picked ? " picked" : " dim";
            }
            return (
              <button key={c.id} className={cls} disabled={phase !== "question"} onClick={() => answer(c.id)}>
                <span className="key">{KEYS[i]}</span>
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt={c.text || t("answerImageN", { n: i + 1 })} className="choice-image" />
                )}
                {c.text && <span><RichText text={c.text} /></span>}
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div>}

      {(phase === "feedback" || phase === "finishing") && (
        <div className="feedback" aria-live="polite">
          <div>
            {result ? (
              <>
                <div className="points" style={result.correct ? undefined : { color: "var(--rose)" }}>
                  {result.correct
                    ? result.multiplier && result.multiplier > 1
                      ? t("comboCorrect", { points: result.points, multiplier: result.multiplier })
                      : t("correct", { points: result.points })
                    : picked === null && claim === null && !responded
                      ? t("timeUp")
                      : t("wrong")}
                </div>
                {gameOver && <p style={{ color: "var(--rose)" }}>{t("noLivesLeft")}</p>}
                {!result.correct && result.wrongFeedback && (
                  <div className="wrong-feedback">
                    <span className="label">{t("whyWrong")}</span>
                    <p><RichText text={result.wrongFeedback} /></p>
                  </div>
                )}
                {cfg.trueFalse && question.type === "choice" && correctText && (
                  <p>
                    {t("rightAnswerLabel")} <RichText text={correctText} />
                  </p>
                )}
                {result.explanation && cfg.timer !== "global" && <p><RichText text={result.explanation} /></p>}
              </>
            ) : (
              <>
                <div className="points" style={{ color: "var(--lilac)" }}>{picked === null && claim === null && !responded ? t("timeUp") : t("savedOffline")}</div>
                <p>{t("savedOfflineHint")}</p>
              </>
            )}
          </div>
          {cfg.timer !== "global" && (
            <button className="btn btn-bright" onClick={next} disabled={phase === "finishing"} autoFocus>
              {isLast || gameOver ? (phase === "finishing" ? t("saving") : mock ? t("mockFinish") : t("seeResults")) : t("next")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
