import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Difficulty } from "./difficulty";

const GeneratedQuiz = z.object({
  title: z.string(),
  description: z.string(),
  questions: z.array(
    z.object({
      prompt: z.string(),
      choices: z.array(z.string()).min(2),
      correctIndex: z.number().int().min(0),
      explanation: z.string(),
      wrongFeedback: z.string(),
    }),
  ),
});
export type GeneratedQuiz = z.infer<typeof GeneratedQuiz>;

// JSON schema for structured outputs (kept to the subset the API supports).
const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "questions"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "choices", "correctIndex", "explanation", "wrongFeedback"],
        properties: {
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          explanation: { type: "string" },
          wrongFeedback: { type: "string" },
        },
      },
    },
  },
} as const;

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  easy: "Difficulty: easy. Ask about key facts and definitions stated directly in the material; wrong choices are clearly different.",
  medium: "Difficulty: medium. Mix recall with understanding; wrong choices are plausible to a student who skimmed the material.",
  hard: "Difficulty: hard. Ask students to apply, compare or reason about the ideas in new situations; wrong choices reflect common misconceptions and are close to the right answer.",
};

export function isGeneratorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateQuizFromPdf(
  pdf: Buffer,
  opts: { questionCount: number; focus?: string; fallbackLocale?: string; difficulty?: Difficulty },
): Promise<GeneratedQuiz> {
  const client = new Anthropic();

  const instructions = [
    `Write a multiple-choice quiz of exactly ${opts.questionCount} questions based only on the attached course document.`,
    "Each question has 4 answer choices, exactly one of them correct; correctIndex is the 0-based index of the correct choice.",
    "Vary where the correct answer appears. Wrong choices should be plausible to a student who skimmed the material.",
    "Cover the document's most important ideas rather than trivia, and write in the same language as the document" +
      (opts.fallbackLocale ? ` (if the document's language is unclear, use the language with code "${opts.fallbackLocale}").` : "."),
    "The explanation says in one or two sentences why the correct answer is right, referring to the material.",
    "wrongFeedback is shown only to a student who answered wrong: in one or two encouraging sentences, name the usual misconception behind the wrong choices and point to the part of the material to review. Don't just repeat the explanation.",
    DIFFICULTY_GUIDE[opts.difficulty ?? "medium"],
    "Write formulas, equations and units in LaTeX between dollar signs, e.g. $Q = m \\cdot c \\cdot \\Delta T$ or $\\mathrm{C_6H_{12}O_6}$ (use $$…$$ only for a long standalone equation). Plain text needs no LaTeX.",
    "Give the quiz a short title and a one-sentence description.",
    opts.focus ? `Teacher's focus for this quiz: ${opts.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: QUIZ_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
          },
          { type: "text", text: instructions },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to generate a quiz from this document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The quiz was too long to generate in one go. Try fewer questions.");
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no quiz.");

  const quiz = GeneratedQuiz.parse(JSON.parse(text.text));
  // Drop any question whose correctIndex doesn't point at a choice.
  quiz.questions = quiz.questions.filter((q) => q.correctIndex < q.choices.length);
  return quiz;
}
