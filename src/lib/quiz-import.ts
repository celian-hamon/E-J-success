import "server-only";
import { z } from "zod";
import { isGameMode, type GameMode } from "./game-modes";
import { isDifficulty, type Difficulty } from "./difficulty";
import { MediaError, releaseMedia, saveImageBytes } from "./media";

// Quiz import from JSON (format: public/quiz-import-example.json, documented in the README).
// Images are base64, either a data URL ("data:image/png;base64,…") or the bare base64.
// Everything is validated before any image is stored, so a bad file leaves nothing behind.

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_QUESTIONS = 200;
const MAX_CHOICES = 6; // the question editor has six answer slots

/** A problem in the file. `path` points at the faulty field, e.g. ["questions", 2, "choices", 0]. */
export class ImportError extends Error {
  constructor(
    public code: "json" | "format" | "correct" | "emptyChoice" | "base64" | "image",
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

const QuestionInput = z.object({
  prompt: text.min(1),
  image,
  explanation: optionalText,
  wrongFeedback: optionalText,
  choices: z.array(ChoiceInput).min(2).max(MAX_CHOICES),
  correctIndex: z.number().int().min(0).optional(),
});

const QuizInput = z.object({
  title: optionalText,
  description: optionalText,
  mode: z.string().optional(),
  difficulty: z.string().optional(),
  secondsPerQuestion: z.number().int().min(5).max(300).optional(),
  questions: z.array(QuestionInput).min(1).max(MAX_QUESTIONS),
});

type ImageRef = { bytes: Buffer; key: string; path: (string | number)[] } | null;

export type ParsedImport = {
  title: string | null;
  description: string | null;
  mode: GameMode | null;
  difficulty: Difficulty | null;
  secondsPerQuestion: number | null;
  questions: {
    prompt: string;
    explanation: string | null;
    wrongFeedback: string | null;
    image: ImageRef;
    choices: { text: string; isCorrect: boolean; image: ImageRef }[];
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
    questions: quiz.questions.map((q, i) => {
      const at = ["questions", i];
      // The correct answer: correctIndex, or else the one choice flagged `correct: true`.
      const flagged = q.choices.flatMap((c, j) => (c.correct ? [j] : []));
      const correct = q.correctIndex ?? (flagged.length === 1 ? flagged[0] : -1);
      if (correct < 0 || correct >= q.choices.length || (q.correctIndex !== undefined && flagged.some((j) => j !== correct))) {
        throw new ImportError("correct", at);
      }
      return {
        prompt: q.prompt,
        explanation: q.explanation,
        wrongFeedback: q.wrongFeedback,
        image: decodeImage(q.image, [...at, "image"]),
        choices: q.choices.map((c, j) => {
          const img = decodeImage(c.image, [...at, "choices", j, "image"]);
          // An answer can be a picture only, but not empty.
          if (!c.text && !img) throw new ImportError("emptyChoice", [...at, "choices", j]);
          return { text: c.text, isCorrect: j === correct, image: img };
        }),
      };
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
