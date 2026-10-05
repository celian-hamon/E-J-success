import "server-only";
import { z } from "zod";
import { isGameMode, MAX_LIVES, type GameMode } from "./game-modes";
import { isDifficulty, type Difficulty } from "./difficulty";
import { MediaError, releaseMedia, saveImageBytes } from "./media";
import {
  cleanZone,
  MAX_CATEGORIES,
  MAX_CHOICES,
  MAX_ITEMS,
  MAX_ZONES,
  type QuestionData,
  type QuestionType,
  type Zone,
} from "./question-types";

// Quiz import from JSON (format: public/quiz-import-example.json, documented in the README).
// Images are base64, either a data URL ("data:image/png;base64,…") or the bare base64.
// Everything is validated before any image is stored, so a bad file leaves nothing behind.

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_QUESTIONS = 200;

/** A problem in the file. `path` points at the faulty field, e.g. ["questions", 2, "choices", 0]. */
export class ImportError extends Error {
  constructor(
    public code: "json" | "format" | "correct" | "emptyChoice" | "base64" | "image" | "category" | "hotspotImage",
    public path: (string | number)[] = [],
    public detail?: string,
    public mediaCode?: MediaError["code"], // why an image was refused, when code is "image"
  ) {
    super(code);
  }
}

const text = z.string().trim();
const optionalText = z.string().trim().nullish().transform((v) => v || null);
const image = z.string().nullish().transform((v) => v?.trim() || null);

const ChoiceInput = z.union([
  z.string().transform((t) => ({ text: t.trim(), image: null, correct: undefined })),
  z.object({ text: text.default(""), image, correct: z.boolean().optional() }),
]);

const ItemInput = z.union([
  z.string().transform((t) => ({ text: t.trim(), image: null })),
  z.object({ text: text.default(""), image }),
]);

const common = { prompt: text.min(1), image, explanation: optionalText, wrongFeedback: optionalText };

// One shape per question type (see src/lib/question-types.ts); no "type" means multiple choice.
const QuestionInput = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) && !("type" in v) ? { ...v, type: "choice" } : v),
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("choice"),
      ...common,
      choices: z.array(ChoiceInput).min(2).max(MAX_CHOICES),
      correctIndex: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("hotspot"),
      ...common,
      // Fractions of the image: x, y = top-left corner; w, h = size.
      zones: z
        .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().positive().max(1), h: z.number().positive().max(1) }))
        .min(1)
        .max(MAX_ZONES),
    }),
    z.object({ type: z.literal("order"), ...common, items: z.array(ItemInput).min(2).max(MAX_ITEMS) }),
    z.object({
      type: z.literal("categorize"),
      ...common,
      categories: z.array(text.min(1)).min(2).max(MAX_CATEGORIES),
      items: z
        .array(z.object({ text: text.default(""), image, category: z.union([z.number().int().min(0), z.string()]) }))
        .min(2)
        .max(MAX_ITEMS),
    }),
    z.object({ type: z.literal("numeric"), ...common, answer: z.number(), tolerance: z.number().min(0).default(0), unit: optionalText }),
  ]),
);

const QuizInput = z.object({
  title: optionalText,
  description: optionalText,
  mode: z.string().optional(),
  difficulty: z.string().optional(),
  secondsPerQuestion: z.number().int().min(5).max(300).optional(),
  combo: z.boolean().optional(),
  lives: z.number().int().min(1).max(MAX_LIVES).nullable().optional(), // null = survival off
  shuffleQuestions: z.boolean().optional(),
  shuffleAnswers: z.boolean().optional(),
  questions: z.array(QuestionInput).min(1).max(MAX_QUESTIONS),
});

type ImageRef = { bytes: Buffer; key: string; path: (string | number)[] } | null;

export type ParsedImport = {
  title: string | null;
  description: string | null;
  mode: GameMode | null;
  difficulty: Difficulty | null;
  secondsPerQuestion: number | null;
  /** Options the file sets; the ones it leaves out come from the import form. */
  options: Partial<{ combo: boolean; lives: number | null; shuffleQuestions: boolean; shuffleAnswers: boolean }>;
  questions: {
    type: QuestionType;
    data: QuestionData | null;
    prompt: string;
    explanation: string | null;
    wrongFeedback: string | null;
    image: ImageRef;
    // Answers (choice) or items, in their stored order (the right order for "order" questions).
    choices: { text: string; isCorrect: boolean; group: number | null; image: ImageRef }[];
  }[];
};

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?(;[\w-]+=[^;,]*)*;base64,/i;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

function decodeImage(value: string | null, path: (string | number)[]): ImageRef {
  if (!value) return null;
  const b64 = value.replace(DATA_URL, "").replace(/\s+/g, "");
  if (!BASE64.test(b64)) throw new ImportError("base64", path);
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) throw new ImportError("base64", path);
  return { bytes, key: b64, path };
}

/** Parses and validates the file. Accepts a quiz object, or a bare array of questions. */
export function parseQuizImport(source: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(source.replace(/^﻿/, ""));
  } catch (err) {
    throw new ImportError("json", [], err instanceof Error ? err.message : undefined);
  }
  if (Array.isArray(raw)) raw = { questions: raw };

  const parsed = QuizInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ImportError("format", issue.path as (string | number)[], issue.message);
  }
  const quiz = parsed.data;

  return {
    title: quiz.title,
    description: quiz.description,
    mode: isGameMode(quiz.mode) ? quiz.mode : null,
    difficulty: isDifficulty(quiz.difficulty) ? quiz.difficulty : null,
    secondsPerQuestion: quiz.secondsPerQuestion ?? null,
    options: Object.fromEntries(
      (["combo", "lives", "shuffleQuestions", "shuffleAnswers"] as const).filter((k) => quiz[k] !== undefined).map((k) => [k, quiz[k]]),
    ),
    questions: quiz.questions.map((q, i) => {
      const at = ["questions", i];
      const base = {
        type: q.type,
        prompt: q.prompt,
        explanation: q.explanation,
        wrongFeedback: q.wrongFeedback,
        image: decodeImage(q.image, [...at, "image"]),
      };
      /** An answer or item: a picture only is fine, empty is not. */
      const entry = (c: { text: string; image: string | null }, field: string, j: number) => {
        const img = decodeImage(c.image, [...at, field, j, "image"]);
        if (!c.text && !img) throw new ImportError("emptyChoice", [...at, field, j]);
        return { text: c.text, image: img };
      };

      switch (q.type) {
        case "choice": {
          // The correct answer: correctIndex, or else the one choice flagged `correct: true`.
          const flagged = q.choices.flatMap((c, j) => (c.correct ? [j] : []));
          const correct = q.correctIndex ?? (flagged.length === 1 ? flagged[0] : -1);
          if (correct < 0 || correct >= q.choices.length || (q.correctIndex !== undefined && flagged.some((j) => j !== correct))) {
            throw new ImportError("correct", at);
          }
          return {
            ...base,
            data: null,
            choices: q.choices.map((c, j) => ({ ...entry(c, "choices", j), isCorrect: j === correct, group: null })),
          };
        }
        case "hotspot": {
          if (!base.image) throw new ImportError("hotspotImage", at);
          const zones = q.zones.map(cleanZone).filter((z): z is Zone => z !== null);
          if (!zones.length) throw new ImportError("format", [...at, "zones"], "no usable zone");
          return { ...base, data: { zones }, choices: [] };
        }
        case "order":
          return { ...base, data: null, choices: q.items.map((c, j) => ({ ...entry(c, "items", j), isCorrect: false, group: null })) };
        case "categorize":
          return {
            ...base,
            data: { categories: q.categories },
            choices: q.items.map((c, j) => {
              // A category is given by its index or its name.
              const group = typeof c.category === "number" ? c.category : q.categories.indexOf(c.category.trim());
              if (group < 0 || group >= q.categories.length) throw new ImportError("category", [...at, "items", j]);
              return { ...entry(c, "items", j), isCorrect: false, group };
            }),
          };
        case "numeric":
          return { ...base, data: { answer: q.answer, tolerance: q.tolerance, unit: q.unit }, choices: [] };
      }
    }),
  };
}

/**
 * Stores every image of a parsed import (re-encoded like any upload; the same base64 used
 * twice is stored once). Returns a lookup from image to Media id, plus a cleanup function
 * for when the quiz can't be created afterwards.
 */
export async function storeImportImages(quiz: ParsedImport, uploadedById: string) {
  const ids = new Map<string, string>();
  const release = async () => {
    for (const id of ids.values()) await releaseMedia(id);
  };
  const refs = quiz.questions.flatMap((q) => [q.image, ...q.choices.map((c) => c.image)]);
  try {
    for (const ref of refs) {
      if (!ref || ids.has(ref.key)) continue;
      try {
        ids.set(ref.key, (await saveImageBytes(ref.bytes, uploadedById)).id);
      } catch (err) {
        throw err instanceof MediaError ? new ImportError("image", ref.path, undefined, err.code) : err;
      }
    }
  } catch (err) {
    await release();
    throw err;
  }
  return { idOf: (ref: ImageRef) => (ref ? (ids.get(ref.key) ?? null) : null), release };
}
