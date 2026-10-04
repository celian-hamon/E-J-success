import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { canManageCourse, getCurrentUser } from "@/lib/auth";
import { isGameMode, quizOptions } from "@/lib/game-modes";
import { generateQuizFromPdf, isGeneratorConfigured, type GeneratedQuiz } from "@/lib/quiz-generator";
import { saveQuizPdf } from "@/lib/uploads";
import { isDifficulty } from "@/lib/difficulty";

export const runtime = "nodejs";
export const maxDuration = 300; // generation on a long PDF can take a few minutes

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const t = await getTranslations("api");
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("signIn") }, { status: 401 });
  if (!(await canManageCourse(user, courseId))) {
    return NextResponse.json({ error: t("notYourCourse") }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: t("choosePdf") }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: t("pdfOnly") }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: t("tooLarge") }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    return NextResponse.json({ error: t("notPdf") }, { status: 400 });
  }

  const mode = isGameMode(form.get("mode")) ? (form.get("mode") as string) : "classic";
  const questionCount = Math.min(30, Math.max(3, Number(form.get("questionCount")) || 10));
  const focus = String(form.get("focus") ?? "").trim().slice(0, 500) || undefined;
  const baseTitle = file.name.replace(/\.pdf$/i, "");
  const difficultyField = form.get("difficulty");
  const difficulty = isDifficulty(difficultyField) ? difficultyField : "medium";
  const options = quizOptions(form);

  let generated: GeneratedQuiz | null = null;
  let warning: string | undefined;
  if (isGeneratorConfigured()) {
    try {
      generated = await generateQuizFromPdf(bytes, { questionCount, focus, difficulty, fallbackLocale: await getLocale() });
    } catch (err) {
      console.error("Quiz generation failed", err);
      warning =
        err instanceof Anthropic.APIError
          ? t("genFailedApi", { status: String(err.status ?? "network") })
          : t("genFailed", { reason: err instanceof Error ? err.message : "?" });
    }
  }

  const quiz = await db.quiz.create({
    data: {
      courseId,
      title: generated?.title || baseTitle,
      description: generated?.description || null,
      mode,
      difficulty,
      ...options,
      sourceFileName: file.name,
      questions: generated
        ? {
            create: generated.questions.map((q, i) => ({
              order: i,
              prompt: q.prompt,
              explanation: q.explanation || null,
              wrongFeedback: q.wrongFeedback || null,
              choices: {
                create: q.choices.map((text, j) => ({ order: j, text, isCorrect: j === q.correctIndex })),
              },
            })),
          }
        : undefined,
    },
  });

  const stored = await saveQuizPdf(quiz.id, bytes);
  await db.quiz.update({ where: { id: quiz.id }, data: { sourceFilePath: stored } });

  return NextResponse.json({ quizId: quiz.id, generated: generated !== null, warning });
}
