"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageCourse, requireRole } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { GAME_MODE_KEYS, quizOptions, type GameMode } from "@/lib/game-modes";
import { getManagedQuiz } from "@/lib/quiz-access";
import { deleteQuizPdf } from "@/lib/uploads";
import { isDifficulty } from "@/lib/difficulty";
import { isUpload, MediaError, releaseMedia, saveImage } from "@/lib/media";
import { evaluate, GRADING_QUIZ_FIELDS, type GradeResult } from "@/lib/grading";
import type { AnswerResponse } from "@/lib/question-types";
import {
  cleanZone,
  MAX_CATEGORIES,
  MAX_CHOICES,
  MAX_ITEMS,
  MAX_ZONES,
  parseNumber,
  questionType,
  type QuestionData,
  type Zone,
} from "@/lib/question-types";

async function requireQuiz(quizId: string) {
  const user = await requireRole("TEACHER", "ADMIN");
  const quiz = await getManagedQuiz(user, quizId);
  if (!quiz) flash("/teacher", "error", (await getTranslations("flash"))("quizNotYours"));
  return quiz;
}

/**
 * Test mode: grades one answer exactly like a real game, but stores nothing (no attempt,
 * no XP, no badges, no pet meal). The run so far (streak, mistakes) comes from the player.
 */
export async function previewAnswer(input: {
  quizId: string;
  questionId: string;
  choiceId: string | null;
  timeMs: number;
  claim?: boolean | null;
  response?: AnswerResponse | null;
  streakBefore: number;
  wrongSoFar: number;
}): Promise<GradeResult> {
  const user = await requireRole("TEACHER", "ADMIN");
  if (!(await getManagedQuiz(user, input.quizId))) throw new Error("unavailable");
  const quiz = await db.quiz.findUnique({
    where: { id: input.quizId },
    select: { ...GRADING_QUIZ_FIELDS, _count: { select: { questions: true } } },
  });
  const question = await db.question.findFirst({ where: { id: input.questionId, quizId: input.quizId }, include: { choices: true } });
  if (!quiz || !question) throw new Error("unavailable");
  const ctx = {
    streakBefore: Math.max(0, Math.min(1000, Math.floor(Number(input.streakBefore) || 0))),
    wrongSoFar: Math.max(0, Math.min(1000, Math.floor(Number(input.wrongSoFar) || 0))),
  };
  return evaluate(question, quiz, quiz._count.questions, { choiceId: input.choiceId, rawTimeMs: input.timeMs, claim: input.claim, response: input.response }, ctx).result;
}

export async function createBlankQuiz(formData: FormData) {
  const user = await requireRole("TEACHER", "ADMIN");
  const t = await getTranslations("flash");
  const courseId = String(formData.get("courseId"));
  if (!(await canManageCourse(user, courseId))) flash("/teacher", "error", t("courseNotYours"));
  const title = String(formData.get("title") ?? "").trim() || t("untitledQuiz");
  const quiz = await db.quiz.create({ data: { courseId, title } });
  flash(`/teacher/quizzes/${quiz.id}`, "ok", t("quizCreated"));
}

export async function updateQuizSettings(formData: FormData) {
  const quiz = await requireQuiz(String(formData.get("quizId")));
  const t = await getTranslations("flash");
  const p = `/teacher/quizzes/${quiz.id}`;
  const SettingsInput = z.object({
    title: z.string().trim().min(1, t("titleRequired")),
    description: z.string().trim().optional().transform((v) => v || null),
    mode: z.enum(GAME_MODE_KEYS as [GameMode, ...GameMode[]]),
    secondsPerQuestion: z.coerce.number().int().min(5).max(300),
  });
  const parsed = SettingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flash(p, "error", parsed.error.issues[0].message);
  const difficulty = formData.get("difficulty");
  await db.quiz.update({
    where: { id: quiz.id },
    data: {
      ...parsed.data,
      ...quizOptions(formData),
      difficulty: isDifficulty(difficulty) ? difficulty : "medium",
    },
  });
  revalidatePath(p);
  flash(p, "ok", t("settingsSaved"));
}

export async function setPublished(formData: FormData) {
  const quiz = await requireQuiz(String(formData.get("quizId")));
  const t = await getTranslations("flash");
  const p = `/teacher/quizzes/${quiz.id}`;
  const publish = formData.get("published") === "true";
  if (publish && (await db.question.count({ where: { quizId: quiz.id } })) === 0) {
    flash(p, "error", t("needQuestion"));
  }
  await db.quiz.update({ where: { id: quiz.id }, data: { published: publish } });
  revalidatePath(p);
  flash(p, "ok", publish ? t("published") : t("unpublished"));
}

export async function deleteQuiz(formData: FormData) {
  const quiz = await requireQuiz(String(formData.get("quizId")));
  const t = await getTranslations("flash");
  const full = await db.quiz.delete({ where: { id: quiz.id } });
  if (full.sourceFilePath) await deleteQuizPdf(full.sourceFilePath);
  flash(`/teacher/courses/${quiz.courseId}`, "ok", t("quizDeleted"));
}

export async function saveQuestion(formData: FormData) {
  const quiz = await requireQuiz(String(formData.get("quizId")));
  const t = await getTranslations("flash");
  const p = `/teacher/quizzes/${quiz.id}`;
  const questionId = String(formData.get("questionId") ?? "") || null;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim() || null;
  const wrongFeedback = String(formData.get("wrongFeedback") ?? "").trim() || null;
  const correctSlot = Number(formData.get("correct"));
  const user = await requireRole("TEACHER", "ADMIN");

  const existing = questionId
    ? await db.question.findFirst({ where: { id: questionId, quizId: quiz.id }, include: { choices: { orderBy: { order: "asc" } } } })
    : null;
  if (questionId && !existing) flash(p, "error", t("questionGone"));

  // Images: keep, remove (checkbox) or replace (new file). Slot i shows existing choice i.
  const imagePlan = (field: string, removeField: string, current: string | null) => {
    const file = formData.get(field);
    const upload = isUpload(file) ? file : null;
    const remove = formData.get(removeField) === "on";
    return { upload, current, keep: remove || upload ? null : current, drop: remove || upload ? current : null };
  };
  const type = questionType(String(formData.get("type") ?? "choice"));
  const questionImage = imagePlan("image", "removeImage", existing?.imageId ?? null);
  // Choice rows: the answers (choice) or the items to order / sort. Hotspot and numeric have none.
  const slotCount = type === "choice" ? MAX_CHOICES : type === "order" || type === "categorize" ? MAX_ITEMS : 0;
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    slot: i,
    text: String(formData.get(`choice${i}`) ?? "").trim(),
    group: String(formData.get(`group${i}`) ?? ""),
    image: imagePlan(`choiceImage${i}`, `removeChoiceImage${i}`, existing?.choices[i]?.imageId ?? null),
  }));
  // A choice counts if it has text or an image (so answers can be pictures only).
  const filled = slots.filter((c) => c.text || c.image.keep || c.image.upload);

  if (!prompt) flash(p, "error", t("needPrompt"));
  let data: QuestionData | null = null;
  let groupOf: (slot: (typeof slots)[number]) => number | null = () => null;
  if (type === "choice") {
    if (filled.length < 2) flash(p, "error", t("needChoices"));
    if (!filled.some((c) => c.slot === correctSlot)) flash(p, "error", t("needCorrect"));
  } else if (type === "order") {
    if (filled.length < 2) flash(p, "error", t("needItems"));
  } else if (type === "categorize") {
    // Empty category fields are skipped; items point at the remaining ones by index.
    const typed = Array.from({ length: MAX_CATEGORIES }, (_, g) => String(formData.get(`category${g}`) ?? "").trim());
    const kept = typed.flatMap((name, g) => (name ? [g] : []));
    if (kept.length < 2) flash(p, "error", t("needCategories"));
    if (filled.length < 2) flash(p, "error", t("needItems"));
    if (filled.some((c) => !kept.includes(Number(c.group)) || c.group === "")) flash(p, "error", t("badCategory"));
    data = { categories: kept.map((g) => typed[g]) };
    groupOf = (c) => kept.indexOf(Number(c.group));
  } else if (type === "numeric") {
    const answer = parseNumber(String(formData.get("answer") ?? ""));
    const rawTolerance = String(formData.get("tolerance") ?? "").trim();
    const tolerance = rawTolerance ? parseNumber(rawTolerance) : 0;
    if (answer === null) flash(p, "error", t("needAnswer"));
    if (tolerance === null || tolerance < 0) flash(p, "error", t("badTolerance"));
    data = { answer: answer!, tolerance: tolerance!, unit: String(formData.get("unit") ?? "").trim() || null };
  } else if (type === "hotspot") {
    let zones: Zone[] = [];
    try {
      const raw = JSON.parse(String(formData.get("zones") ?? "[]"));
      zones = (Array.isArray(raw) ? raw : []).map(cleanZone).filter((z): z is Zone => z !== null).slice(0, MAX_ZONES);
    } catch {
      /* treated as no zones */
    }
    if (!questionImage.keep && !questionImage.upload) flash(p, "error", t("needHotspotImage"));
    if (zones.length === 0) flash(p, "error", t("needZone"));
    data = { zones };
  }
  const dataJson = data ? JSON.stringify(data) : null;

  // Validation passed: now store the new images.
  const saved: string[] = [];
  const store = async (upload: File | null, keep: string | null) => {
    if (!upload) return keep;
    const media = await saveImage(upload, user.id);
    saved.push(media.id);
    return media.id;
  };
  let questionImageId: string | null;
  let choices: { order: number; text: string; isCorrect: boolean; group: number | null; imageId: string | null }[];
  try {
    questionImageId = await store(questionImage.upload, questionImage.keep);
    choices = [];
    for (const [order, c] of filled.entries()) {
      choices.push({
        order, // for "order" questions, this is the right position
        text: c.text,
        isCorrect: type === "choice" && c.slot === correctSlot,
        group: groupOf(c),
        imageId: await store(c.image.upload, c.image.keep),
      });
    }
  } catch (err) {
    for (const id of saved) await releaseMedia(id);
    flash(p, "error", err instanceof MediaError ? t(`image_${err.code}`) : t("imageInvalid"));
  }

  if (!existing) {
    const order = await db.question.count({ where: { quizId: quiz.id } });
    await db.question.create({
      data: {
        quizId: quiz.id,
        order,
        type,
        data: dataJson,
        prompt,
        explanation,
        wrongFeedback,
        imageId: questionImageId,
        choices: { create: choices },
      },
    });
  } else {
    // Update choices in place so past answers keep pointing at the right choice.
    const leftover = existing.choices.slice(choices.length);
    await db.$transaction([
      db.question.update({
        where: { id: existing.id },
        data: { type, data: dataJson, prompt, explanation, wrongFeedback, imageId: questionImageId },
      }),
      ...choices.map((c, i) =>
        existing.choices[i]
          ? db.choice.update({ where: { id: existing.choices[i].id }, data: c })
          : db.choice.create({ data: { ...c, questionId: existing.id } }),
      ),
      db.choice.deleteMany({ where: { id: { in: leftover.map((c) => c.id) } } }),
    ]);
    // Clean up images that were removed, replaced, or belonged to dropped choices.
    const dropped = [questionImage.drop, ...slots.map((s) => s.image.drop), ...leftover.map((c) => c.imageId)];
    for (const id of dropped) await releaseMedia(id);
  }
  revalidatePath(p);
  flash(p, "ok", questionId ? t("questionSaved") : t("questionAdded"));
}

export async function deleteQuestion(formData: FormData) {
  const quiz = await requireQuiz(String(formData.get("quizId")));
  const t = await getTranslations("flash");
  const p = `/teacher/quizzes/${quiz.id}`;
  const question = await db.question.findFirst({
    where: { id: String(formData.get("questionId")), quizId: quiz.id },
    select: { id: true, imageId: true, choices: { select: { imageId: true } } },
  });
  await db.question.deleteMany({ where: { id: question?.id ?? "", quizId: quiz.id } });
  if (question) for (const id of [question.imageId, ...question.choices.map((c) => c.imageId)]) await releaseMedia(id);
  // Re-number the remaining questions.
  const rest = await db.question.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" }, select: { id: true } });
  await db.$transaction(rest.map((q, i) => db.question.update({ where: { id: q.id }, data: { order: i } })));
  revalidatePath(p);
  flash(p, "ok", t("questionDeleted"));
}
